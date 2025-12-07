# Install Poppler for PDF to Image Conversion

## Windows Installation (Quick Method)

### Option 1: Using Chocolatey (Recommended)
```powershell
# Install Chocolatey if you don't have it
# Run PowerShell as Administrator and run:
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Then install poppler
choco install poppler
```

### Option 2: Manual Installation
1. Download Poppler for Windows from: https://github.com/oschwartz10612/poppler-windows/releases/
2. Download the latest `Release-XX.XX.X-X.zip` file
3. Extract to `C:\Program Files\poppler`
4. Add `C:\Program Files\poppler\Library\bin` to your System PATH:
   - Open System Properties → Environment Variables
   - Edit "Path" under System Variables
   - Add new entry: `C:\Program Files\poppler\Library\bin`
   - Click OK and restart your terminal

### Option 3: Using Scoop
```powershell
# Install Scoop if you don't have it
irm get.scoop.sh | iex

# Then install poppler
scoop install poppler
```

## Verify Installation
After installation, restart your terminal and run:
```bash
pdftoppm -v
```

You should see the Poppler version information.

## Then Restart Your Dev Server
```bash
npm run dev
```
