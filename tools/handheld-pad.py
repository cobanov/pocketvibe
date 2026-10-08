#!/usr/bin/env python3
"""A virtual gamepad on the handheld, for testing PocketVibe without touching it.

Copy it to the handheld and start it there before PocketVibe (or any time:
PocketVibe looks for new gamepads every few seconds). tools/handheld-run.sh
sends it commands from the computer; on the handheld they go through a FIFO:

    python3 /tmp/handheld-pad.py </dev/null >/tmp/handheld-pad.log 2>&1 &
    echo 'tap a' > /tmp/vpad.fifo
    echo 'hold start,select 1600' > /tmp/vpad.fifo   (back to the launcher)
    echo 'shot library' > /tmp/vpad.fifo            (screenshot to /tmp/shots)
    echo 'quit' > /tmp/vpad.fifo

Commands: tap <button>..., hold <button>[,<button>] <ms>, wait <ms>,
shot <name>, mark (touches /tmp/vpad.done), quit. Buttons: a b x y l r select
start up down left right. Directions come from a second, keyboard device:
WebKit does not see this pad's d-pad. WebKit shows a gamepad to a page only
after its first press, so the first press on a new page should be a hold of
200-300 ms rather than a tap.
"""
import fcntl, os, struct, subprocess, time

EV_SYN, EV_KEY, EV_ABS = 0, 1, 3
UI_SET_EVBIT, UI_SET_KEYBIT, UI_SET_ABSBIT = 0x40045564, 0x40045565, 0x40045567
UI_DEV_SETUP, UI_ABS_SETUP, UI_DEV_CREATE, UI_DEV_DESTROY = 0x405C5503, 0x401C5504, 0x5501, 0x5502
BUTTONS = {'a': 305, 'b': 304, 'x': 307, 'y': 308, 'l': 310, 'r': 311, 'select': 314, 'start': 315}
FIFO = '/tmp/vpad.fifo'
ENV = dict(os.environ, XDG_RUNTIME_DIR='/var/run/0-runtime-dir', WAYLAND_DISPLAY='wayland-1')

fd = os.open('/dev/uinput', os.O_WRONLY | os.O_NONBLOCK)
fcntl.ioctl(fd, UI_SET_EVBIT, EV_KEY)
fcntl.ioctl(fd, UI_SET_EVBIT, EV_ABS)
for code in BUTTONS.values():
    fcntl.ioctl(fd, UI_SET_KEYBIT, code)
for axis, low, high in ((0, -32768, 32767), (1, -32768, 32767), (16, -1, 1), (17, -1, 1)):
    fcntl.ioctl(fd, UI_SET_ABSBIT, axis)
    # struct uinput_abs_setup: code, absinfo (value, min, max, fuzz, flat, resolution)
    fcntl.ioctl(fd, UI_ABS_SETUP, struct.pack('Hxxiiiiii', axis, 0, low, high, 0, 0, 0))
fcntl.ioctl(fd, UI_DEV_SETUP, struct.pack('HHHH80sI', 0x03, 0x045e, 0x028e, 1, b'PocketVibe test pad', 0))
fcntl.ioctl(fd, UI_DEV_CREATE)
event = struct.Struct('llHHi')

# The pad's d-pad does not reach WebKit, so directions come from a keyboard's arrows.
ARROWS = {'up': 103, 'down': 108, 'left': 105, 'right': 106}
kb = os.open('/dev/uinput', os.O_WRONLY | os.O_NONBLOCK)
fcntl.ioctl(kb, UI_SET_EVBIT, EV_KEY)
for code in ARROWS.values():
    fcntl.ioctl(kb, UI_SET_KEYBIT, code)
fcntl.ioctl(kb, UI_DEV_SETUP, struct.pack('HHHH80sI', 0x03, 0x1209, 0x5058, 1, b'PocketVibe test arrows', 0))
fcntl.ioctl(kb, UI_DEV_CREATE)


def key(code, value):
    os.write(fd, event.pack(0, 0, EV_KEY, code, value) + event.pack(0, 0, EV_SYN, 0, 0))


def press(name, down):
    if name not in ARROWS and name not in BUTTONS:
        print(f'unknown button {name}', flush=True)
        return
    if name in ARROWS:
        os.write(kb, event.pack(0, 0, EV_KEY, ARROWS[name], 1 if down else 0) + event.pack(0, 0, EV_SYN, 0, 0))
    else:
        key(BUTTONS[name], 1 if down else 0)


if os.path.exists(FIFO):
    os.unlink(FIFO)
os.mkfifo(FIFO)
os.makedirs('/tmp/shots', exist_ok=True)
running = True
while running:
    with open(FIFO) as commands:
        for line in commands:
            parts = line.split()
            if not parts:
                continue
            if parts[0] == 'quit':
                running = False
                break
            if parts[0] == 'tap':
                for name in parts[1:]:
                    press(name, True)
                    time.sleep(0.09)
                    press(name, False)
                    time.sleep(0.3)
            elif parts[0] == 'hold':
                names = parts[1].split(',')
                for name in names:
                    press(name, True)
                time.sleep(int(parts[2]) / 1000)
                for name in names:
                    press(name, False)
            elif parts[0] == 'wait':
                time.sleep(int(parts[1]) / 1000)
            elif parts[0] == 'mark':  # tells pad.sh the batch before it is done
                open('/tmp/vpad.done', 'w').close()
            elif parts[0] == 'shot':
                subprocess.run(['grim', f'/tmp/shots/{parts[1]}.png'], env=ENV, check=False)
fcntl.ioctl(fd, UI_DEV_DESTROY)
fcntl.ioctl(kb, UI_DEV_DESTROY)
os.unlink(FIFO)
