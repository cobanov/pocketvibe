#!/usr/bin/env python3
"""Runs a command inside PocketVibe's runtime: a Debian root with WPE WebKit.

This is not a chroot. The runtime gets its own mount namespace and becomes
its root with pivot_root. WebKit sandboxes every page with bubblewrap, and
bubblewrap refuses to work inside a chroot; in a real mount namespace it
does, so games run sandboxed.

    runtime.py [--root DIR] -- COMMAND [ARGS...]

The command gets a clean environment with the session's Wayland, PulseAudio
and D-Bus sockets; COG_*, WEBKIT_* and GST_* variables are passed through.
"""

import ctypes
import os
import sys
from pathlib import Path

DEFAULT_ROOT = '/storage/pocketvibe/runtime'
RUNTIME_DIR = '/run/0-runtime-dir'  # the session's Wayland, Sway, PulseAudio and D-Bus sockets

MS_NOSUID, MS_NODEV, MS_NOEXEC = 2, 4, 8
MS_BIND, MS_REC, MS_PRIVATE = 4096, 16384, 1 << 18
MNT_DETACH = 2
SYS_PIVOT_ROOT = 41  # aarch64

libc = ctypes.CDLL(None, use_errno=True)


def check(result, what):
    if result != 0:
        errno = ctypes.get_errno()
        raise OSError(errno, f'{what}: {os.strerror(errno)}')


def mount(source, target, fstype=None, flags=0):
    encode = lambda s: str(s).encode() if s is not None else None
    check(libc.mount(encode(source), encode(target), encode(fstype), flags, None), f'mount {target}')


def bind(source, target):
    Path(target).mkdir(parents=True, exist_ok=True)
    mount(source, target, flags=MS_BIND | MS_REC)


def enter(root):
    os.unshare(os.CLONE_NEWNS)
    mount(None, '/', flags=MS_REC | MS_PRIVATE)  # nothing done here leaks back to the system
    bind(root, root)  # the new root has to be a mount point
    bind('/dev', root / 'dev')
    (root / 'proc').mkdir(exist_ok=True)
    mount('proc', root / 'proc', 'proc', MS_NOSUID | MS_NODEV | MS_NOEXEC)
    bind('/sys', root / 'sys')
    (root / 'tmp').mkdir(exist_ok=True)
    mount('tmpfs', root / 'tmp', 'tmpfs', MS_NOSUID | MS_NODEV)
    bind(RUNTIME_DIR, root / RUNTIME_DIR.lstrip('/'))
    if Path('/run/udev').is_dir():  # lets libmanette find the gamepad
        bind('/run/udev', root / 'run/udev')
    (root / 'etc/resolv.conf').write_text(Path('/etc/resolv.conf').read_text())

    old = root / '.oldroot'
    old.mkdir(exist_ok=True)
    os.chdir(root)
    check(libc.syscall(SYS_PIVOT_ROOT, b'.', b'.oldroot'), 'pivot_root')
    os.chdir('/')
    check(libc.umount2(b'/.oldroot', MNT_DETACH), 'umount old root')


def main(argv):
    root = Path(DEFAULT_ROOT)
    if argv[:1] == ['--root']:
        root, argv = Path(argv[1]), argv[2:]
    if argv[:1] == ['--']:
        argv = argv[1:]
    if not argv:
        sys.exit(__doc__)

    env = {
        'HOME': '/root',
        'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        'LANG': 'C.UTF-8',
        'WAYLAND_DISPLAY': os.environ.get('WAYLAND_DISPLAY', 'wayland-1'),
        'XDG_RUNTIME_DIR': RUNTIME_DIR,
        'PULSE_SERVER': f'unix:{RUNTIME_DIR}/pulse/native',
        'DBUS_SESSION_BUS_ADDRESS': f'unix:path={RUNTIME_DIR}/bus',
    }
    env.update({k: v for k, v in os.environ.items() if k.startswith(('COG_', 'WEBKIT_', 'GST_'))})

    enter(root.resolve())
    # After pivot_root the system's Python library is out of sight, so use
    # nothing that could import a module now: find the program by hand.
    program = argv[0]
    if '/' not in program:
        for folder in env['PATH'].split(':'):
            if os.access(f'{folder}/{program}', os.X_OK):
                program = f'{folder}/{program}'
                break
    os.execve(program, argv, env)


if __name__ == '__main__':
    main(sys.argv[1:])
