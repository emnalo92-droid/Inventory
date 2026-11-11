# Windows Host Server & Desktop App Guide

This guide explains how to run **Candy Store & Takehome Inventory** directly on your Windows PC and use your computer as the **central server** for your cashiers, store terminals, and branch devices.

---

## ⚡ Quick Start (One-Click)

1. **Install Node.js** (if you don't already have it):
   - Download the LTS version from: [https://nodejs.org](https://nodejs.org)
   - Follow the installer prompts and keep default options.

2. **First Time Setup**:
   - Double-click **`setup-windows.bat`**.
   - This automatically installs dependencies, builds the production app, and places two shortcuts directly on your Windows Desktop:
     - 🖥️ **Candy Store Host Server**
     - 🚀 **Candy Store Desktop App**

3. **Start the Server**:
   - Double-click **`start-windows-server.bat`** (or the Desktop shortcut).
   - The command window will display your computer's local Wi-Fi / LAN IP address (for example: `http://192.168.1.50:3000`).
   - The app will automatically open in a native desktop window on your computer!

---

## 🌐 Connecting Cashiers & Other Computers on Wi-Fi

All cashiers, laptops, and tablets connected to the **same store Wi-Fi or office network** can access the system simultaneously:

1. Look at the IP address shown when you run `start-windows-server.bat` (or click the **Server Info** button inside the app header).
2. On any cashier computer, tablet, or smartphone browser, type:
   ```
   http://<YOUR-COMPUTER-IP>:3000
   ```
   *Example: `http://192.168.1.50:3000`*
3. The cashier can immediately log in, record shift inventories, and submit sales. All data syncs in real time with your server!

---

## 📌 What to Do If Your IP Address is Set to "Automatically Obtain" (DHCP)

When Windows is set to **"Obtain an IP address automatically"**, your Wi-Fi router might assign your computer a different IP address whenever the computer restarts or the router reboots (for example, `192.168.1.15` today, but `192.168.1.22` next week).

Here are the **3 simple solutions**:

### Solution 1: Use Your Computer Name URL (Easiest — No Settings to Change!)
Windows automatically broadcasts your computer name on your local network. You don't even need to use numbers:
- Cashiers on Windows/Android/Mac/iPads can simply type:
  ```
  http://<YOUR-COMPUTER-NAME>:3000
  ```
  *Example: if your computer name is `DESKTOP-POS`, use `http://DESKTOP-POS:3000` or `http://desktop-pos.local:3000`.*
- **Advantage**: Even if your router assigns a new dynamic IP address, the computer name URL **always stays the same**!

### Solution 2: Set a Static (Fixed) IP in Windows in 1 Minute
If you prefer using a fixed IP (e.g., `192.168.1.100`), you can lock it in Windows Settings:
1. Press `Windows Key + R`, type `cmd`, and press Enter. Type `ipconfig` to see your current **IPv4 Address**, **Subnet Mask**, and **Default Gateway** (e.g. `192.168.1.1`).
2. Open **Windows Settings** (`Windows Key + I`) -> **Network & internet** -> **Wi-Fi** (or **Ethernet**).
3. Click your connected network properties.
4. Under **IP assignment**, click **Edit**.
5. Change from **Automatic (DHCP)** to **Manual**.
6. Turn on **IPv4** and enter:
   - **IP address**: Your preferred IP (e.g., `192.168.1.100` or your current IP).
   - **Subnet prefix length** (or Subnet mask): `24` (or `255.255.255.0`).
   - **Gateway**: Your router address (usually `192.168.1.1` or `192.168.0.1`).
   - **Preferred DNS**: `8.8.8.8` (Google DNS) or your gateway IP.
7. Click **Save**. Your computer will now keep this exact IP address forever!

### Solution 3: DHCP Reservation on Your Wi-Fi Router
If you have access to your store router's admin page (e.g. `http://192.168.1.1`):
1. Go to **LAN Settings** or **DHCP Server Settings**.
2. Find **Address Reservation** / **Static Lease**.
3. Select your computer name or MAC address and assign it a permanent IP.
4. Save and reboot the router. Your computer can stay on "Obtain automatically", but the router will always give it the exact same IP!

---

## 🛡️ Windows Firewall Configuration (One-Time)

If other computers cannot connect to your PC, Windows Defender Firewall might be blocking incoming connections to port 3000.

To allow it:
1. Open **Command Prompt** or **PowerShell** as **Administrator** (Right-click Start menu -> Run as Administrator).
2. Copy and paste this single command:
   ```cmd
   netsh advfirewall firewall add rule name="CandyStoreServer" dir=in action=allow protocol=TCP localport=3000
   ```
3. Press **Enter**. You will see `Ok.` Now all computers on your local network can connect!

---

## 🚀 Running as a Native Windows Desktop Application

You do not need to use a browser with tabs and address bars:
- Double-click **`launch-desktop-app.bat`** (or the desktop shortcut).
- This launches Microsoft Edge or Google Chrome in **Standalone App Mode** (`--app=http://localhost:3000`), giving you a borderless, fast native desktop window with its own taskbar icon.
- You can also click the **"Install App"** icon in the browser address bar to install it as an official Windows App in your Windows Start Menu!

---

## 🔄 Auto-Start on Windows Boot (Optional)

If you want the server to start automatically whenever you turn on your computer:
1. Press `Windows Key + R` to open the Run dialog.
2. Type `shell:startup` and press **Enter** (this opens your Windows Startup folder).
3. Right-click and create a shortcut to `start-windows-server.bat`.
4. Done! Every time Windows boots, the server starts automatically in the background.
