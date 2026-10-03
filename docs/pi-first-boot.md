# Pi first-boot checklists

Two Raspberry Pi 5s, two roles:

- **Pi #1, `hub`**: the always-on home of the agent stack (watchdog, ntfy, agent, Tailscale).
- **Pi #2, `ender`**: Klipper + Moonraker for the Ender 3, which makes the printer the first
  device in the inventory. Later also the "hands" service and LAN bridge.

Do the router step first; both Pis depend on it.

## Before either Pi: router

- [ ] Give both Pis **DHCP reservations** on your router so their IPs never change. The device
      inventory and the watchdog allowlist are keyed by IP. Write them down:
      `hub = 192.168.1.___`, `ender = 192.168.1.___`.
- [ ] Ethernet for the hub if at all possible. Wi-Fi is fine for the printer.

---

## Pi #1: `hub`

### Flash

- [ ] Raspberry Pi Imager → **Raspberry Pi OS Lite (64-bit)**. In the settings gear:
      hostname `hub`, your username, a password, **enable SSH**, Wi-Fi only if no Ethernet,
      locale/timezone.
- [ ] Boot it, wait a minute, then from the Mac: `ssh you@hub.local`.

### Base system

```sh
sudo apt update && sudo apt full-upgrade -y && sudo reboot
# after it comes back:
sudo apt install -y git python3 curl
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
exit   # log out and back in so the docker group applies
```

- [ ] `docker run --rm hello-world` prints the hello message.

### Tailscale

```sh
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

- [ ] Open the link it prints and sign in with the same account you'll use on the iPhone.
- [ ] In the Tailscale admin console → **DNS**: turn on **MagicDNS** and **HTTPS Certificates**.
- [ ] `tailscale status` shows the Pi's name, e.g. `hub.tail1234.ts.net`. Write it down.
- [ ] Install Tailscale on the iPhone (App Store) and sign in.

### The stack

```sh
git clone https://github.com/kentin0-fiz0l/SpatialOS.git
cd SpatialOS && git checkout watchdog-proxy
cd watchdog
cp watchdog.example.yaml watchdog.yaml
cp devices.example.yaml devices.yaml      # then edit; empty `devices: []` is fine to start
```

- [ ] In `watchdog.yaml`: set `approvals.listen_host: 0.0.0.0` and uncomment the
      `127.0.0.0/8` line under `untrusted_sources` (both are required inside Docker).
- [ ] Create `.env` with the key and workspace, then lock it down. Do this on the Pi so the
      key never goes through chat or a shell history; `read -s` hides what you paste:

  ```sh
  read -rsp "Paste ANTHROPIC_API_KEY: " KEY && printf 'ANTHROPIC_API_KEY=%s\n' "$KEY" > .env && unset KEY; echo
  echo 'ANTHROPIC_WORKSPACE_ID=wrkspc_01XqfG3ZrnZ5gDLWqzXVFfkX' >> .env
  chmod 600 .env
  ```

- [ ] ntfy with your tailnet name (this also configures `tailscale serve` and restarts the
      stack; the first build takes a few minutes on the Pi):

  ```sh
  ./ntfy-setup.sh hub.tail1234.ts.net
  ```

- [ ] `docker compose ps` shows `ntfy`, `watchdog`, `scout`, `researcher` all `Up`/`healthy`.
- [ ] `./isolation-test.sh` passes every check (allowed paths 200, escape attempts 403/000,
      phone flow approves).

### Phone approvals

- [ ] iPhone: install **ntfy** (App Store). Settings → **Users** → add
      `https://hub.tail1234.ts.net`, user `iphone`, password from
      `cat secrets/ntfy-iphone-password` on the Pi.
- [ ] **+** → subscribe to topic `watchdog-approvals`, "Use another server" →
      `https://hub.tail1234.ts.net`. Allow notifications.
- [ ] Test from the Pi: this is held until you tap Approve on the phone, then returns 401
      (Google rejected it for lack of credentials, which means it got through):

  ```sh
  docker compose exec scout curl -s -o /dev/null -w '%{http_code}\n' --max-time 300 \
    -X POST -d x https://gmail.googleapis.com/gmail/v1/users/me/messages/send
  ```

### First agent run on the hub

```sh
docker compose exec researcher python agent.py "Research how Klipper's input shaping works and write a one-page summary"
```

- [ ] Output lands in `~/SpatialOS/agent/workspace/`.
- [ ] On the Mac, stop the laptop copy so there's one watchdog: `cd ~/Projects/Active/SpatialOS/watchdog && docker compose down`.

---

## Pi #2: `ender` (Klipper + Moonraker for the Ender 3)

### What you need

- The Ender 3 and its power supply.
- A **USB-A to mini-USB** cable (the Ender's board has a mini-USB port). Data cable, not a
  charge-only one.
- The Pi near the printer (a 1 m USB cable is plenty).
- To find out which mainboard the Ender has: look under the printer's electronics cover.
  Printed on the board:
  - **"Creality V1.1.x"** (2018–2019, 8-bit ATmega1284P): the usual board on an old Ender 3.
    **These shipped without a bootloader**, so the very first Klipper flash needs a
    programmer: a USBasp (about $5) or any Arduino Uno wired as an ISP. After that, flashing
    is over USB. The alternative is a 32-bit board swap (BTT SKR Mini E3 V3, about $35),
    which is quieter, flashes from an SD card, and is the common upgrade for this printer.
  - **"V4.2.2" or "V4.2.7"** (2020+, 32-bit STM32): flashes from the SD card, no programmer.

### Flash the Pi

- [ ] Raspberry Pi Imager → **Other specific-purpose OS → 3D printing → Mainsail OS**
      (64-bit). Settings gear: hostname `ender`, username, password, **enable SSH**, Wi-Fi.
- [ ] Boot. After a couple of minutes open `http://ender.local` in a browser: the Mainsail
      UI loads and shows a Klipper error about the MCU. That's expected until the printer is
      flashed.

### Build Klipper for the Ender's board

```sh
ssh you@ender.local
cd ~/klipper && make menuconfig
```

Pick one:

- **Creality V1.1.x:** Micro-controller Architecture → *Atmega AVR*, Processor → *atmega1284p*,
  baud 250000.
- **V4.2.2 / V4.2.7:** Architecture → *STMicroelectronics STM32*, Processor → *STM32F103*,
  Bootloader offset → *28KiB*, Communication interface → *Serial (on USART1 PA10/PA9)*.

Then `q`, save, and `make`. The result is `~/klipper/out/klipper.bin`.

- [ ] Build finished with no errors.

### Flash the printer

- **V4.2.x:** copy `klipper.bin` to a FAT32 micro-SD as `firmware.bin` (use a new name each
  time you reflash, e.g. `firmware1.bin`; the board ignores a name it has seen). Printer off,
  insert card, power on, wait 30 s. The screen stays blank under Klipper; that's normal.
- **V1.1.x with no bootloader (first time only):** burn a bootloader with the USBasp or
  Arduino-as-ISP (the Klipper docs page *"Bootloaders"* and the many Ender 3 guides cover
  the six wires). After that, with the printer connected by USB:

  ```sh
  ls /dev/serial/by-id/          # note the device name
  cd ~/klipper && make flash FLASH_DEVICE=/dev/serial/by-id/usb-1a86_USB_Serial-if00-port0
  ```

- [ ] Printer flashed; `ls /dev/serial/by-id/` shows one device while the printer is on.

### Configure Klipper

```sh
# V1.1.x:
cp ~/klipper/config/printer-creality-ender3-2018.cfg ~/printer_data/config/printer.cfg
# V4.2.2:
cp ~/klipper/config/printer-creality-ender3-v2-2020.cfg ~/printer_data/config/printer.cfg
```

- [ ] Edit `printer.cfg`: set `serial:` under `[mcu]` to the `/dev/serial/by-id/...` path.
- [ ] In Mainsail, click **Restart firmware**. The status turns **Ready**.
- [ ] Hand-check before any motion: in Mainsail, heat the bed to 50 °C and watch the
      temperature rise, then turn it off. Jog X by 10 mm; it moves the right way. Home all
      axes (`G28`) with your hand near the power switch.
- [ ] Optional but worth it: PID-tune the hotend and bed
      (`PID_CALIBRATE HEATER=extruder TARGET=200`, then `SAVE_CONFIG`).

### Give the agent the printer

Moonraker's API key (run on the Pi; localhost is a trusted client):

```sh
curl -s http://localhost:7125/access/api_key
```

- [ ] On the **hub**, add the key to `watchdog/.env` as `MOONRAKER_API_KEY=...` and this
      entry to `watchdog/devices.yaml`:

  ```yaml
  devices:
    - name: ender3
      skill: gadget-moonraker-3d-printers
      host: 192.168.1.___          # the ender Pi's reserved IP
      notes: Moonraker on port 7125, Mainsail UI on port 80. Old Ender 3, no camera yet.
      credential:
        header: X-Api-Key
        env: MOONRAKER_API_KEY
  ```

- [ ] Starting a print stays a human action. Add this rule near the top of the `rules:` list
      in `watchdog.yaml` so it matches before anything else:

  ```yaml
    - decision: deny
      hosts: [192.168.1.___]      # ender
      methods: [POST]
      paths: ["/printer/print/start", "/printer/gcode/script"]
      reason: prints are started by a person, not the agent
  ```

  Heating also goes through `/printer/gcode/script` (M104/M140), so with this rule the agent
  can't heat anything either; that's the right default for an unattended old Ender. Status
  reads go straight through; pause, cancel and job-queue writes are held for your approval
  like any other write. Loosen the rule once there's a camera on the printer.

- [ ] `docker compose up -d --build --wait watchdog researcher` on the hub to load the
      inventory, then:

  ```sh
  docker compose exec researcher python agent.py "What is the Ender 3 doing right now? Report its state, temperatures and any queued jobs."
  ```

  Expected: it calls `list_devices`, reads the Moonraker skill, GETs `/printer/objects/query`
  and reports. Nothing is held, because that's all reads.

### Later

- A camera on the printer (a Pi camera module or a USB webcam via Crowsnest, which
  MainsailOS includes) is the precondition for letting the agent do more than watch.
- The "hands" service for this Pi, so the agent can run commands here under policy.
