"""The handheld's buttons as key presses.

The browser in runtime 2 (WPE WebKit 2.54 from Debian) reads no gamepads: it
was built without libmanette. PocketVibe's launcher and games read the
keyboard too, with the same keys a desktop browser uses (handheld.js), so a
virtual keyboard types them: X is A, Z is B, S is X, A is Y, Q and W are L and
R, Enter is Start, Shift is Select, and the d-pad and the left stick are the
arrows.

Gamepads are found again every few seconds, so one plugged in later works.
"""

import fcntl
import os
import re
import select
import struct
import time
from pathlib import Path

EV_SYN, EV_KEY, EV_ABS = 0, 1, 3
UI_SET_EVBIT, UI_SET_KEYBIT = 0x40045564, 0x40045565
UI_DEV_SETUP, UI_DEV_CREATE = 0x405C5503, 0x5501
EVENT = struct.Struct('llHHi')  # struct input_event on 64-bit Linux
EVIOCGABS_X = 0x80184540  # EVIOCGABS(0): struct input_absinfo for an axis

KEY_UP, KEY_DOWN, KEY_LEFT, KEY_RIGHT = 103, 108, 105, 106
# Button (evdev code) -> key. Linux names the face buttons by position:
# BTN_EAST is the right one (A on Nintendo-style handhelds), BTN_SOUTH the
# bottom one (B), BTN_NORTH the top (X), BTN_WEST the left (Y).
BUTTONS = {
    305: 45,  # BTN_EAST -> X key (A)
    304: 44,  # BTN_SOUTH -> Z key (B)
    307: 31,  # BTN_NORTH -> S key (X)
    308: 30,  # BTN_WEST -> A key (Y)
    310: 16,  # BTN_TL -> Q key (L)
    311: 17,  # BTN_TR -> W key (R)
    315: 28,  # BTN_START -> Enter
    314: 42,  # BTN_SELECT -> left Shift
    544: KEY_UP,  # BTN_DPAD_UP
    545: KEY_DOWN,
    546: KEY_LEFT,
    547: KEY_RIGHT,
}
# Handhelds whose buttons report the other position for A and B, by the
# device tree's model name.
SWAPPED_AB = re.compile(r'Anbernic RG DS', re.I)
ABS_X, ABS_Y, ABS_HAT0X, ABS_HAT0Y = 0, 1, 16, 17
BTN_SELECT, BTN_START = 314, 315


def gamepads():
    """Input devices that have both Start and Select buttons."""
    found = []
    try:
        blocks = Path('/proc/bus/input/devices').read_text().split('\n\n')
    except OSError:  # not Linux: nothing to read
        return found
    for block in blocks:
        handler = re.search(r'H: Handlers=.*?(event\d+)', block)
        keys = re.search(r'B: KEY=([0-9a-f ]+)', block)
        if not handler or not keys:
            continue
        bits = int(''.join(word.rjust(16, '0') for word in keys.group(1).split()), 16)
        if bits >> BTN_SELECT & 1 and bits >> BTN_START & 1:
            found.append('/dev/input/' + handler.group(1))
    return found


def button_map():
    try:
        model = Path('/proc/device-tree/model').read_text()
    except OSError:
        model = ''
    mapping = dict(BUTTONS)
    if SWAPPED_AB.search(model):
        mapping[304], mapping[305] = mapping[305], mapping[304]
    return mapping


def create_keyboard(keys):
    fd = os.open('/dev/uinput', os.O_WRONLY | os.O_NONBLOCK)
    fcntl.ioctl(fd, UI_SET_EVBIT, EV_KEY)
    for code in keys:
        fcntl.ioctl(fd, UI_SET_KEYBIT, code)
    # struct uinput_setup: bus (virtual), vendor, product, version, name, ff_effects_max
    fcntl.ioctl(fd, UI_DEV_SETUP, struct.pack('HHHH80sI', 0x06, 0x1209, 0x5056, 1, b'PocketVibe buttons', 0))
    fcntl.ioctl(fd, UI_DEV_CREATE)
    return fd


def axis_range(fd, axis):
    """(min, max) of an absolute axis, or None."""
    try:
        info = fcntl.ioctl(fd, EVIOCGABS_X + axis, bytes(24))
        _, low, high, *_ = struct.unpack('iiiiii', info)
        return (low, high) if high > low else None
    except OSError:
        return None


def run():
    """Forever: read the gamepads and type their keys. Never raises."""
    mapping = button_map()
    try:
        keyboard = create_keyboard(set(mapping.values()))
    except OSError:
        return  # no uinput: the browser may read the gamepad itself
    held = {}  # key -> set of sources holding it, so a d-pad and a stick do not fight

    def send(key, source, down):
        holders = held.setdefault(key, set())
        before = bool(holders)
        (holders.add if down else holders.discard)(source)
        if bool(holders) != before:
            os.write(keyboard, EVENT.pack(0, 0, EV_KEY, key, 1 if holders else 0) + EVENT.pack(0, 0, EV_SYN, 0, 0))

    fds = {}  # path -> fd
    ranges = {}  # fd -> {axis: (min, max)}
    scanned = 0.0
    while True:
        if time.monotonic() - scanned > 5:
            scanned = time.monotonic()
            for path in gamepads():
                if path not in fds:
                    try:
                        fds[path] = fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
                        ranges[fd] = {axis: axis_range(fd, axis) for axis in (ABS_X, ABS_Y, ABS_HAT0X, ABS_HAT0Y)}
                    except OSError:
                        pass
        ready, _, _ = select.select(list(fds.values()), [], [], 0.5)
        for fd in ready:
            try:
                data = os.read(fd, EVENT.size * 64)
            except BlockingIOError:
                continue
            except OSError:  # unplugged: let go of everything it held
                os.close(fd)
                fds = {path: f for path, f in fds.items() if f != fd}
                for key in list(held):
                    for source in [s for s in held[key] if s[0] == fd]:
                        send(key, source, False)
                continue
            for offset in range(0, len(data) - EVENT.size + 1, EVENT.size):
                _, _, kind, code, value = EVENT.unpack_from(data, offset)
                if kind == EV_KEY and code in mapping and value in (0, 1):
                    send(mapping[code], (fd, code), value == 1)
                elif kind == EV_ABS and ranges.get(fd, {}).get(code):
                    low, high = ranges[fd][code]
                    middle, reach = (low + high) / 2, (high - low) / 2
                    # Sticks need a clear push; a hat is -1, 0 or 1.
                    level = (value - middle) / reach
                    threshold = 0.5 if code in (ABS_X, ABS_Y) else 0.1
                    minus, plus = (KEY_LEFT, KEY_RIGHT) if code in (ABS_X, ABS_HAT0X) else (KEY_UP, KEY_DOWN)
                    send(minus, (fd, code), level < -threshold)
                    send(plus, (fd, code), level > threshold)
