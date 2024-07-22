import os
import pty
import threading
import time


def handle_input(master_fd):
    while True:
        data = os.read(master_fd, 1024)
        if data:
            # print hex
            print("received: "+"".join(f"{b:02x} " for b in data))
            time.sleep(0.1)
            os.write(master_fd,  data)


def main():
    master_fd, slave_fd = pty.openpty()
    slave_name = os.ttyname(slave_fd)
    print(f"Virtual COM Port: {slave_name}")

    thread = threading.Thread(target=handle_input, args=(master_fd,))
    thread.daemon = True
    thread.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("Exiting")


if __name__ == "__main__":
    main()
