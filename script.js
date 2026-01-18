// Linus USB Tree Viewer - extracted JS
// VERSION ID - Change only this value to update version throughout the page
const APP_VERSION = 'V 1.0';

// Auto-update version throughout the page
document.addEventListener('DOMContentLoaded', function() {
  document.title = `Linus USB Tree Viewer ${APP_VERSION}`;
  const mainHeader = document.querySelector('h1');
  if (mainHeader) {
    mainHeader.textContent = `Linus USB Tree Viewer ${APP_VERSION}`;
  }
  const versionElement = document.querySelector('.version-number');
  if (versionElement) {
    versionElement.textContent = APP_VERSION;
  }
});

const resetScripts = {
  Windows: {
    title: 'Windows (run as Administrator in PowerShell)',
    content: `# USB Hub Reset Script for Windows (Excludes Storage and HID Devices, VM-Safe)
# Run as Administrator
# WARNING: This script AGGRESSIVELY resets USB hubs, which may temporarily disrupt connected devices. Save all work before proceeding!

Write-Host "=============================================================" -ForegroundColor Red
Write-Host "WARNING: This script will AGGRESSIVELY reset USB hubs!" -ForegroundColor Red
Write-Host "This may temporarily disrupt USB devices. Ensure all work is saved." -ForegroundColor Red
Write-Host "Proceed with caution, especially on virtual machines!" -ForegroundColor Red
Write-Host "=============================================================" -ForegroundColor Red
Write-Host ""

# Prompt to check if running on a virtual machine
$isVM = Read-Host "Is this a virtual machine? (Type 'Yes' or 'No')"
$isVirtualMachine = $isVM -eq "Yes" -or $isVM -eq "yes" -or $isVM -eq "Y" -or $isVM -eq "y"

Write-Host ""

function Restart-Device {
    param([string]$InstanceId, [string]$FriendlyName)
    try {
        Write-Host "-> Stopping: $FriendlyName ($InstanceId)" -ForegroundColor Yellow
        Disable-PnpDevice -InstanceId $InstanceId -Confirm:$false -ErrorAction Stop
        Start-Sleep -Seconds 2
        Write-Host "-> Starting: $FriendlyName ($InstanceId)" -ForegroundColor Green
        Enable-PnpDevice -InstanceId $InstanceId -Confirm:$false -ErrorAction Stop
    }
    catch {
        Write-Host "Error with device $FriendlyName ($InstanceId): $_" -ForegroundColor Red
    }
}

# Base filter for USB hubs, excluding storage and HID devices
$usbHubFilter = {
    $_.InstanceId -match "USB" -and 
    $_.FriendlyName -match "Hub" -and 
    $_.FriendlyName -notmatch "Root" -and 
    $_.Class -notmatch "HIDClass" -and 
    $_.InstanceId -notmatch "USBSTOR"
}

# Additional VM-specific safety: exclude virtualized controllers and critical devices
if ($isVirtualMachine) {
    Write-Host "Running in VM-safe mode to avoid breaking virtual USB controllers." -ForegroundColor Cyan
    $usbHubs = Get-PnpDevice | Where-Object {
        &$usbHubFilter -and 
        $_.InstanceId -notmatch "VMware" -and 
        $_.InstanceId -notmatch "Virtual" -and 
        $_.Class -notmatch "System"
    }
} else {
    Write-Host "Running in standard mode for physical PC (aggressive USB hub reset)." -ForegroundColor Cyan
    $usbHubs = Get-PnpDevice | Where-Object $usbHubFilter
}

Write-Host "\n=== Resetting USB hubs ==="
if ($usbHubs) {
    foreach ($hub in $usbHubs) { 
        Restart-Device -InstanceId $hub.InstanceId -FriendlyName $hub.FriendlyName 
    }
} else {
    Write-Host "No eligible USB hubs found (excluding Root Hubs, Storage, HID, and VM-critical devices)." -ForegroundColor Yellow
}

Write-Host "\n=== USB Hub Reset Script finished ===" -ForegroundColor Cyan
Write-Host "\n=== Rebooting computer in 10 seconds to complete USB reset ===" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to cancel the reboot" -ForegroundColor Yellow
Start-Sleep -Seconds 10
Write-Host "Rebooting now..." -ForegroundColor Red
Restart-Computer -Force`
  },
  Mac: {
    title: 'Mac (sudo privileges in Terminal)',
    content: `#!/bin/bash
# USB Reset Script for macOS (Intel & Apple Silicon)
# Troubleshooting only - requires sudo

echo "=== USB Reset Script starting ==="

# 1. List USB devices
echo ">>> Connected USB devices:"
system_profiler SPUSBDataType

# 2. Unmount all USB storage devices
echo ">>> Unmounting USB storage devices..."
for disk in $(diskutil list | grep external | awk '{print $1}'); do
    echo " - Unmounting $disk"
    diskutil unmountDisk force $disk
done

# 3. Attempt to reload USB storage driver
echo ">>> Attempting USB driver reload..."
sudo kextunload /System/Library/Extensions/IOUSBMassStorageClass.kext 2>/dev/null
sleep 2
sudo kextload /System/Library/Extensions/IOUSBMassStorageClass.kext 2>/dev/null

# 4. Show updated USB status
echo ">>> Updated USB status:"
system_profiler SPUSBDataType

echo "=== USB Reset Script finished ==="

# Reboot computer in 10 seconds to complete USB reset
echo ""
echo "=== Rebooting computer in 10 seconds to complete USB reset ==="
echo "Press Ctrl+C to cancel the reboot"
sleep 10
echo "Rebooting now..."
sudo shutdown -r now`
  },
  Linux: {
    title: 'Linux (sudo privileges in Terminal)',
    content: `#!/bin/bash
# USB Reset Script for Linux
# Troubleshooting only - requires sudo

echo "=== USB Reset Script starting ==="

# 1. List USB devices
echo ">>> Connected USB devices:"
lsusb

# 2. Unmount all USB storage devices
echo ">>> Unmounting USB storage devices..."
for dev in $(lsblk -o NAME,TRAN | grep usb | awk '{print $1}'); do
    echo " - Unmounting /dev/$dev"
    umount -f /dev/$dev* 2>/dev/null
done

# 3. Reset all USB devices
echo ">>> Resetting USB devices..."
for dev in /sys/bus/usb/devices/*/authorized; do
    echo 0 > $dev
    sleep 2
    echo 1 > $dev
done

# Alternative (reset the USB host controller directly)
# echo -n "0000:00:14.0" > /sys/bus/pci/drivers/xhci_hcd/unbind
# sleep 2
# echo -n "0000:00:14.0" > /sys/bus/pci/drivers/xhci_hcd/bind

# 4. Show updated USB status
echo ">>> Updated USB status:"
lsusb

echo "=== USB Reset Script finished ==="

# Reboot computer in 10 seconds to complete USB reset
echo ""
echo "=== Rebooting computer in 10 seconds to complete USB reset ==="
echo "Press Ctrl+C to cancel the reboot"
sleep 10
echo "Rebooting now..."
sudo reboot`
  }
};

function detectPlatform() {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes('macintosh') || userAgent.includes('mac os') || userAgent.includes('macos')) {
    return 'mac';
  }
  if (userAgent.includes('windows') || userAgent.includes('win32') || userAgent.includes('win64')) {
    return 'windows';
  }
  if (userAgent.includes('linux') && !userAgent.includes('android')) {
    return 'linux';
  }
  if (userAgent.includes('x11') && !userAgent.includes('windows')) {
    return 'linux';
  }
  return null;
}

const resultInputPlaceholders = {
  default: 'Select platform or paste data directly here:',
  mac: 'Open Terminal. Run the script, enter your sudo password when asked, then wait until it finishes. When it’s done, copy the entire Terminal output and paste it here.',
  windows: 'Open PowerShell and paste the script. Allow Admin credentials or use the no-admin script if preferred. Wait until the script finishes — it will open the output in Notepad; copy the full Notepad content and paste it here.',
  linux: 'Open Terminal. Run the script and enter sudo if required. Let it complete, then copy the entire Terminal output and paste it here.'
};

function autoDetectPlatform() {
  const detectedPlatform = detectPlatform();
  if (detectedPlatform) {
    document.getElementById('platform').value = detectedPlatform;
    const event = new Event('change');
    document.getElementById('platform').dispatchEvent(event);
  }
}

function toggleWarning() {
  const warning = document.getElementById('warning');
  const supportButton = document.getElementById('supportButton');
  if (warning.style.display === 'block') {
    warning.style.display = 'none';
    supportButton.textContent = 'Support';
  } else {
    warning.style.display = 'block';
    supportButton.textContent = 'Close Support';
  }
}

function showScript(os) {
  const script = resetScripts[os];
  document.getElementById('dialogTitle').textContent = script.title;
  document.getElementById('scriptContent').textContent = script.content;
  try { const fh = document.getElementById('floatingHint'); if (fh) { fh.style.display = 'none'; fh.setAttribute('aria-hidden','true'); } } catch(e) {}
  document.getElementById('scriptDialog').style.display = 'block';
}

function copyDialogScript() {
  const scriptContent = document.getElementById('scriptContent').textContent;
  try {
    navigator.clipboard.writeText(scriptContent).then(() => {
      alert('Script copied to clipboard!');
    }).catch(err => {
      const tempInput = document.createElement('textarea');
      tempInput.value = scriptContent;
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand('copy');
      document.body.removeChild(tempInput);
      alert('Script copied to clipboard!');
    });
  } catch (err) {
    alert('Failed to copy script. Please copy manually.');
  }
}

function closeDialog() {
  document.getElementById('scriptDialog').style.display = 'none';
  try { const selected = document.getElementById('platform').value; updatePlatformHint(selected); } catch(e) {}
}

function closePageDataDialog() {
  const dialog = document.getElementById('pageDataDialog');
  if (dialog) dialog.style.display = 'none';
  const statusElem = document.getElementById('pageDataStatus');
  const sourceElem = document.getElementById('pageDataSource');
  if (statusElem) statusElem.textContent = '';
  if (sourceElem) sourceElem.textContent = '';
  try { const fh = document.getElementById('floatingHint'); if (fh) { updatePlatformHint(document.getElementById('platform').value); } } catch(e) {}
}

let defaultPageData = [
  { 'Platform': 'Mac Apple Silicon (all models)', 'USB Max Tiers': '5', 'USB Max Hubs': '3', 'Rec. Stable Tiers': '3', 'Rec. Stable Hubs': '2', 'Max Jumps': '3', 'Dock Recommended (1–5)': '5', 'Stability (1–5)': '4', 'Camera Reliability at Max Jump (1–10)': '7' },
  { 'Platform': 'Mac Intel', 'USB Max Tiers': '7', 'USB Max Hubs': '5', 'Rec. Stable Tiers': '5', 'Rec. Stable Hubs': '3', 'Max Jumps': '4', 'Dock Recommended (1–5)': '4', 'Stability (1–5)': '4', 'Camera Reliability at Max Jump (1–10)': '8' },
  { 'Platform': 'PC x86/x64', 'USB Max Tiers': '7', 'USB Max Hubs': '5', 'Rec. Stable Tiers': '5', 'Rec. Stable Hubs': '3', 'Max Jumps': '4', 'Dock Recommended (1–5)': '4', 'Stability (1–5)': '4', 'Camera Reliability at Max Jump (1–10)': '8' },
  { 'Platform': 'PC ARM', 'USB Max Tiers': '6', 'USB Max Hubs': '4', 'Rec. Stable Tiers': '4', 'Rec. Stable Hubs': '2', 'Max Jumps': '3', 'Dock Recommended (1–5)': '3', 'Stability (1–5)': '3', 'Camera Reliability at Max Jump (1–10)': '6' },
  { 'Platform': 'Linux x86/x64', 'USB Max Tiers': '6', 'USB Max Hubs': '4', 'Rec. Stable Tiers': '4', 'Rec. Stable Hubs': '2', 'Max Jumps': '4', 'Dock Recommended (1–5)': '4', 'Stability (1–5)': '4', 'Camera Reliability at Max Jump (1–10)': '7' },
  { 'Platform': 'Linux ARM', 'USB Max Tiers': '6', 'USB Max Hubs': '4', 'Rec. Stable Tiers': '4', 'Rec. Stable Hubs': '2', 'Max Jumps': '3', 'Dock Recommended (1–5)': '2', 'Stability (1–5)': '3', 'Camera Reliability at Max Jump (1–10)': '5' },
  { 'Platform': 'Android Phone – Qualcomm', 'USB Max Tiers': '5', 'USB Max Hubs': '3', 'Rec. Stable Tiers': '3', 'Rec. Stable Hubs': '2', 'Max Jumps': '3', 'Dock Recommended (1–5)': '3', 'Stability (1–5)': '4', 'Camera Reliability at Max Jump (1–10)': '6' },
  { 'Platform': 'Android Tablet – Qualcomm', 'USB Max Tiers': '5', 'USB Max Hubs': '3', 'Rec. Stable Tiers': '3', 'Rec. Stable Hubs': '2', 'Max Jumps': '3', 'Dock Recommended (1–5)': '3', 'Stability (1–5)': '4', 'Camera Reliability at Max Jump (1–10)': '6' },
  { 'Platform': 'Android Phone – Google Tensor', 'USB Max Tiers': '4', 'USB Max Hubs': '2', 'Rec. Stable Tiers': '2', 'Rec. Stable Hubs': '1', 'Max Jumps': '2', 'Dock Recommended (1–5)': '3', 'Stability (1–5)': '3', 'Camera Reliability at Max Jump (1–10)': '5' },
  { 'Platform': 'Android Tablet – Google Tensor', 'USB Max Tiers': '4', 'USB Max Hubs': '2', 'Rec. Stable Tiers': '2', 'Rec. Stable Hubs': '1', 'Max Jumps': '2', 'Dock Recommended (1–5)': '3', 'Stability (1–5)': '3', 'Camera Reliability at Max Jump (1–10)': '5' },
  { 'Platform': 'Android Phone – Samsung Exynos', 'USB Max Tiers': '4', 'USB Max Hubs': '2', 'Rec. Stable Tiers': '2', 'Rec. Stable Hubs': '1', 'Max Jumps': '2', 'Dock Recommended (1–5)': '2', 'Stability (1–5)': '2', 'Camera Reliability at Max Jump (1–10)': '4' },
  { 'Platform': 'Android Tablet – Samsung Exynos', 'USB Max Tiers': '4', 'USB Max Hubs': '2', 'Rec. Stable Tiers': '2', 'Rec. Stable Hubs': '1', 'Max Jumps': '2', 'Dock Recommended (1–5)': '2', 'Stability (1–5)': '2', 'Camera Reliability at Max Jump (1–10)': '4' },
  { 'Platform': 'Android Phone – MediaTek (mid/high)', 'USB Max Tiers': '4', 'USB Max Hubs': '2', 'Rec. Stable Tiers': '2', 'Rec. Stable Hubs': '1', 'Max Jumps': '2', 'Dock Recommended (1–5)': '3', 'Stability (1–5)': '3', 'Camera Reliability at Max Jump (1–10)': '5' },
  { 'Platform': 'Android Tablet – MediaTek', 'USB Max Tiers': '4', 'USB Max Hubs': '2', 'Rec. Stable Tiers': '2', 'Rec. Stable Hubs': '1', 'Max Jumps': '2', 'Dock Recommended (1–5)': '3', 'Stability (1–5)': '3', 'Camera Reliability at Max Jump (1–10)': '5' },
  { 'Platform': 'iOS USB-C – iPad M-series', 'USB Max Tiers': '4', 'USB Max Hubs': '2', 'Rec. Stable Tiers': '2', 'Rec. Stable Hubs': '1', 'Max Jumps': '2', 'Dock Recommended (1–5)': '4', 'Stability (1–5)': '4', 'Camera Reliability at Max Jump (1–10)': '6' },
  { 'Platform': 'iOS USB-C – iPad A-series', 'USB Max Tiers': '3', 'USB Max Hubs': '1', 'Rec. Stable Tiers': '1', 'Rec. Stable Hubs': '1', 'Max Jumps': '1', 'Dock Recommended (1–5)': '3', 'Stability (1–5)': '3', 'Camera Reliability at Max Jump (1–10)': '5' },
  { 'Platform': 'iOS USB-C – iPhone', 'USB Max Tiers': '4', 'USB Max Hubs': '2', 'Rec. Stable Tiers': '2', 'Rec. Stable Hubs': '1', 'Max Jumps': '2', 'Dock Recommended (1–5)': '3', 'Stability (1–5)': '3', 'Camera Reliability at Max Jump (1–10)': '5' },
  { 'Platform': 'iOS Lightning – iPhone', 'USB Max Tiers': '3', 'USB Max Hubs': '1', 'Rec. Stable Tiers': '1', 'Rec. Stable Hubs': '1', 'Max Jumps': '1', 'Dock Recommended (1–5)': '1', 'Stability (1–5)': '2', 'Camera Reliability at Max Jump (1–10)': '3' }
];
let pageData = JSON.parse(JSON.stringify(defaultPageData));
let pageDataLoaded = false;
let pageDataLoading = false; // new flag to indicate loading state (used for UI spinner)
let pageDataSourceMessage = 'Using built-in/default data.';
let pageDataStatusMessage = '';

async function openPageDataDialog() {
  document.getElementById('pageDataDialog').style.display = 'block';
  try { const fh = document.getElementById('floatingHint'); if (fh) { fh.style.display = 'none'; fh.setAttribute('aria-hidden','true'); } } catch(e) {}
  await reloadPageData();
  updateCsvStatusIndicator(document.getElementById('platform').value);
}

async function reloadPageData() {
  const maxRetries = 5;
  const retryDelayMs = 3000;
  pageDataStatusMessage = 'Loading...';
  pageDataLoading = true; // set loading flag so UI shows spinner
  const statusElem = document.getElementById('pageDataStatus');
  const sourceElem = document.getElementById('pageDataSource');
  const reloadBtn = document.getElementById('reloadCsvButton');
  if (statusElem) statusElem.textContent = pageDataStatusMessage;
  if (sourceElem) sourceElem.textContent = '';
  // show loading indicator in the CSV status UI
  try { updateCsvStatusIndicator(document.getElementById('platform').value); } catch (e) {}
  if (reloadBtn) { reloadBtn.disabled = true; reloadBtn.setAttribute('aria-busy', 'true'); }
  // animate the reload button (rotate symbol) and indicate loading
  const csvIndicator = document.getElementById('csvIndicator');
  try { if (reloadBtn) reloadBtn.classList.add('loading'); if (csvIndicator) csvIndicator.classList.add('loading'); } catch(e) {}

  let attempt = 0;
  let fetched = false;
  for (attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // show attempt in the UI
      pageDataStatusMessage = attempt === 1 ? 'Loading...' : `Loading... (attempt ${attempt}/${maxRetries})`;
      if (statusElem) statusElem.textContent = pageDataStatusMessage;
      try { updateCsvStatusIndicator(document.getElementById('platform').value); } catch (e) {}
      await loadPageDataFromRoot();
      if (pageDataLoaded) { fetched = true; break; }
    } catch (e) {
      // ignore and retry
    }
    if (attempt < maxRetries) {
      // update status and wait before retrying
      pageDataStatusMessage = `Retrying in ${Math.round(retryDelayMs/1000)}s... (attempt ${attempt}/${maxRetries})`;
      if (statusElem) statusElem.textContent = pageDataStatusMessage;
      await new Promise(r => setTimeout(r, retryDelayMs));
    }
  }
  if (!fetched) {
    pageDataStatusMessage = `Failed to load CSV after ${maxRetries} attempts.`;
    pageDataSourceMessage = 'Using built-in/default data (fetch failed).';
  }
  if (statusElem) statusElem.textContent = pageDataStatusMessage || '';
  if (sourceElem) sourceElem.textContent = pageDataSourceMessage || '';
  const openLink = document.getElementById('pageDataOpen');
  try {
    if (pageDataSourceMessage && pageDataSourceMessage.includes('Loaded data from')) {
      const name = pageDataSourceMessage.match(/'(.*)'/);
      if (openLink && name && name[1]) {
        openLink.href = name[1];
      }
    } else {
      if (openLink) openLink.href = 'page-data.csv';
    }
  } catch (e) {}
  renderPageData();
  try {
    const sel = document.getElementById('platform');
    if (sel) {
      suppressPlatformChangeClear = true;
      sel.dispatchEvent(new Event('change'));
      suppressPlatformChangeClear = false;
    }
  } catch (e) {
    suppressPlatformChangeClear = false;
  }
  // clear loading state and remove animations first, then update indicator to final state
  pageDataLoading = false;
  try { if (reloadBtn) reloadBtn.classList.remove('loading'); if (csvIndicator) csvIndicator.classList.remove('loading'); } catch(e) {}
  try { updateCsvStatusIndicator(document.getElementById('platform').value); } catch (e) {}
  if (reloadBtn) { reloadBtn.disabled = false; reloadBtn.removeAttribute('aria-busy'); }
}

function renderPageData() {
  const content = document.getElementById('pageDataContent');
  if (!content) return;
  if (!pageData || !pageData.length) {
    content.innerHTML = '<div style="font-size:12px; color:#666;">No page data available.</div>';
    return;
  }
  const headers = Object.keys(pageData[0]);
  let html = `<table class="page-data-table"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>`;
  pageData.forEach(row => {
    html += '<tr>' + headers.map(h => {
      let cell = escapeHtml(String(row[h] || ''));
      // convert newlines (including those from CSV <br> replacements) to <br> for HTML display
      cell = cell.replace(/\n/g, '<br>');
      return `<td>${cell}</td>`;
    }).join('') + '</tr>';
  });
  html += '</tbody></table>';
  content.innerHTML = html;
  try {
    const table = content.querySelector('table.page-data-table');
    if (table) {
      let lastRow = null;
      let lastColCells = [];
      const clearHighlight = () => {
        if (lastRow) {
          lastRow.classList.remove('crosshair-row');
          Array.from(lastRow.children).forEach(c => c.classList.remove('crosshair-row-active'));
        }
        if (lastColCells && lastColCells.length) {
          lastColCells.forEach(c => c.classList.remove('crosshair-col'));
        }
        lastRow = null;
        lastColCells = [];
      };
      table.addEventListener('mouseover', (e) => {
        const cell = e.target.closest('td, th');
        if (!cell || !table.contains(cell)) return;
        clearHighlight();
        const row = cell.parentElement;
        const colIndex = Array.prototype.indexOf.call(row.children, cell);
        const rowIndex = Array.prototype.indexOf.call(table.querySelectorAll('tr'), row);
        if (row) {
          row.classList.add('crosshair-row');
          Array.from(row.children).forEach((c, idx) => {
            if (idx <= colIndex) c.classList.add('crosshair-row-active');
          });
        }
        const allRows = Array.from(table.querySelectorAll('tr'));
        const colCells = allRows.slice(0, rowIndex + 1).map(r => r.children[colIndex]).filter(Boolean);
        colCells.forEach(c => c.classList.add('crosshair-col'));
        lastRow = row;
        lastColCells = colCells;
      });
      table.addEventListener('mouseleave', () => clearHighlight());
    }
  } catch (e) {
    // ignore crosshair failures
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function downloadPageDataCSV() {
  if (!pageData || !pageData.length) return;
  const headers = Object.keys(pageData[0]);
  const csvLines = [headers.join(',')];
  pageData.forEach(row => {
    csvLines.push(headers.map(h => csvEscape(String(row[h] || ''))).join(','));
  });
  const csv = csvLines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'page-data.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(val) {
  if (val == null) return '';
  if (val.indexOf(',') !== -1 || val.indexOf('"') !== -1 || val.indexOf('\n') !== -1) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

function parseCSVToObjects(csv) {
  const lines = csv.trim().split(/\r?\n/).filter(l => l.trim() !== '');
  if (!lines.length) return [];
  const headers = parseCSVLine(lines[0]);
  const objects = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      // Allow HTML <br> (and HTML-escaped &lt;br&gt;) as line breaks in CSV tips; translate to real newlines
      let val = values[j] || '';
      try {
        if (val && typeof val === 'string') {
          // Replace encoded versions first
          val = val.replace(/&lt;br\s*\/?&gt;/gi, '\n');
          // Replace literal <br>, <br/>, <br /> (case-insensitive)
          val = val.replace(/<br\s*\/?\s*>/gi, '\n');
        }
      } catch (e) {}
      obj[headers[j]] = val;
    }
    objects.push(obj);
  }
  return objects;
}

function parseCSVLine(line) {
  const fields = [];
  let curr = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line.charAt(i);
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line.charAt(i + 1) === '"') {
          curr += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        curr += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(curr);
        curr = '';
      } else {
        curr += ch;
      }
    }
  }
  fields.push(curr);
  return fields;
}

async function loadPageDataFromRoot() {
  try {
    const urls = ['page-data', 'page-data.csv'];
    let fetched = false;
    for (let u of urls) {
      try {
        const full = u + '?t=' + Date.now();
        const resp = await fetch(full, { cache: 'no-store' });
        if (resp && resp.ok) {
          const csvText = await resp.text();
          const parsed = parseCSVToObjects(csvText);
          if (parsed && parsed.length) {
            pageData = parsed;
            try {
              const url = new URL(resp.url, window.location.href);
              pageDataSourceMessage = `Loaded data from '${url.pathname.split('/').pop()}' (root).`;
            } catch (e) {
              pageDataSourceMessage = `Loaded data from '${u}' (root).`;
            }
            const rowCount = parsed.length;
            const colCount = parsed[0] ? Object.keys(parsed[0]).length : 0;
            const lastMod = resp.headers.get('Last-Modified');
            pageDataStatusMessage = lastMod ? `Last modified: ${lastMod} — ${rowCount} rows, ${colCount} cols` : `Loaded at ${new Date().toLocaleString()} — ${rowCount} rows, ${colCount} cols`;
            fetched = true;
            break;
          } else {
            pageDataStatusMessage = `Parsed 0 rows in '${u}' (root).`;
          }
        } else if (resp) {
          try { const url = new URL(resp.url, window.location.href); pageDataSourceMessage = `Attempted '${url.pathname.split('/').pop()}': HTTP ${resp.status} ${resp.statusText}`; } catch (e) { pageDataSourceMessage = `Attempted '${u}': HTTP ${resp.status} ${resp.statusText}`; }
          pageDataStatusMessage = `HTTP ${resp.status} ${resp.statusText}`;
        }
      } catch (err) {
        // ignore per-URL fetch errors
      }
    }
    if (!fetched) {
      pageDataSourceMessage = 'Using built-in/default data (page-data not found or parse failed).';
      pageDataStatusMessage = '';
      try {
        if (window && window.location && window.location.protocol === 'file:') {
          pageDataStatusMessage = 'Note: Files cannot be fetched via file://; run a local HTTP server (see tips).';
        }
      } catch (e) {}
    }
    pageDataLoaded = fetched;
  } catch (err) {
    pageDataSourceMessage = 'Using built-in/default data (fetch failed).';
    pageDataStatusMessage = '';
    pageDataLoaded = false;
  }
}

function clearAll() {
  window.location.reload();
}

const instructions = {
  windows: 'Paste the script into PowerShell (run as Administrator). After running, a Notepad window will open and contain the script output; wait until the script finishes and copy the full Notepad content and paste it here.',
  mac: 'Paste the script into Terminal, run it, enter your sudo password when requested, wait for it to complete. Once finished, copy the entire Terminal output and paste it here.',
  linux: 'Paste the script into Terminal, run it, optionally enter your sudo password, and wait for completion. Once finished, copy the entire Terminal output and paste it here.'
};

const platformInfo = {
  windows: {
    maxHubs: '4 external hubs (practical)',
    maxTiers: '5 tiers (USB specification maximum)',
    hasLimitation: false
  },
  mac: {
    maxHubs: '2 (Apple Silicon) / 3-4 (Intel)',
    maxTiers: '5 tiers (USB specification maximum)',
    hasLimitation: true
  },
  linux: {
    maxHubs: '4-5 external hubs (theoretical spec limit)',
    maxTiers: '5 tiers (USB specification maximum)',
    hasLimitation: false
  }
};

function getPlatformNotes(platformValue) {
  if (!platformValue) return null;
  if (pageDataLoaded) {
    const csvRow = findPageDataRowForPlatform(platformValue) || aggregateRowsForPlatformValue(platformValue);
    if (csvRow && csvRow['Notes'] && String(csvRow['Notes']).trim()) return String(csvRow['Notes']).trim();
    return null;
  }
  return null;
}

function findPageDataRowForPlatform(platformValue) {
  if (!pageData || !pageData.length) return null;
  const key = (platformValue || '').toLowerCase();
  const prefers = {
    mac: ['apple silicon', 'mac', 'ipad', 'iphone'],
    windows: ['pc x86', 'pc arm', 'pc', 'windows'],
    linux: ['linux']
  };
  const candidates = prefers[key] || [];
  for (const c of candidates) {
    const row = pageData.find(r => r['Platform'] && r['Platform'].toLowerCase().includes(c));
    if (row) return row;
  }
  const fallbackRow = pageData.find(r => r['Platform'] && r['Platform'].toLowerCase().includes(key));
  if (fallbackRow) return fallbackRow;
  return pageData[0] || null;
}

function getNumericFromCSVField(field) {
  if (!field) return null;
  const match = String(field).match(/(\d+)/g);
  if (!match || !match.length) return null;
  return parseInt(match[0], 10);
}

function parseRange(field) {
  if (!field) return null;
  const matches = String(field).match(/(\d+)/g);
  if (!matches || !matches.length) return null;
  const nums = matches.map(n => parseInt(n, 10));
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

function findPageDataRowByNameContains(sub) {
  if (!sub || !pageData || !pageData.length) return null;
  const key = sub.toLowerCase();
  return pageData.find(r => r['Platform'] && r['Platform'].toLowerCase().includes(key));
}

function buildPlatformRowFromInfo(platformValue) {
  if (!platformValue) return null;
  const info = platformInfo[platformValue] || null;
  if (!info) return null;
  const row = {
    'Platform': platformDisplayNames[platformValue] || (platformValue || ''),
    'USB Max Tiers': info.maxTiers || '',
    'USB Max Hubs': info.maxHubs || '',
    'Rec. Stable Tiers': info.recStableTiers || '',
    'Rec. Stable Hubs': info.recStableHubs || '',
    'Max Jumps': '',
    'Dock Recommended (1–5)': '',
    'Stability (1–5)': '',
    'Camera Reliability at Max Jump (1–10)': '',
    'Notes': (info.notes && info.notes.length) ? info.notes.join('\n') : ''
  };
  return row;
}

function getRowForPlatform(platformValue) {
  if (!platformValue) return null;
  if (pageDataLoaded) {
    const csvRow = findPageDataRowForPlatform(platformValue) || aggregateRowsForPlatformValue(platformValue);
    if (csvRow) return csvRow;
  }
  return buildPlatformRowFromInfo(platformValue);
}

function getPlatformStatusFromCsv(maxJumps, csvRow, fallbackPlatformType) {
  if (!csvRow) return getPlatformStatus(maxJumps, fallbackPlatformType || 'windows');
  const numTiers = (maxJumps || 0) + 1;
  const stableRange = parseRange(csvRow['Rec. Stable Tiers']) || { min: null, max: null };
  const maxRange = parseRange(csvRow['USB Max Tiers']) || { min: null, max: null };
  const stableMax = stableRange && stableRange.max ? stableRange.max : (stableRange && stableRange.min ? stableRange.min : null);
  const absoluteMax = maxRange && maxRange.max ? maxRange.max : (maxRange && maxRange.min ? maxRange.min : null);
  if (stableMax != null && numTiers <= stableMax) return 'Stable';
  if (absoluteMax != null && numTiers <= absoluteMax) return '<span style="font-weight: bold;">Unstable</span>';
  return '<span style="font-weight: bold;">Not working</span>';
}

function detectPlatformFromPaste(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const lower = raw.toLowerCase();
  if (lower.includes('get-pnpdevice') || /usb\\vid_/.test(lower) || /powershell/.test(lower) || lower.includes('notepad') || lower.includes('win32')) {
    return 'windows';
  }
  if (lower.includes('ioreg -p iousb') || lower.includes('ioregistryentry') || /applet[a-z0-9]*usbxhci/.test(lower) || lower.includes('usbxhci') || lower.includes('iousb') || lower.includes('applet')) {
    return 'mac';
  }
  if (lower.includes('lsusb -t') || lower.includes('lsusb') || lower.includes('/:') || /usb\s\d+-\d+/.test(lower)) {
    return 'linux';
  }
  return null;
}

function aggregateRowsForCategory(key) {
  if (!pageData || !pageData.length) return null;
  const mapping = {
    windows: ['pc x86', 'pc arm', 'pc', 'windows'],
    macAppleSilicon: ['mac apple silicon', 'apple silicon'],
    macIntel: ['mac intel'],
    linux: ['linux'],
    androidPhone: ['android phone'],
    androidTablet: ['android tablet'],
    ipad: ['ios usb-c – ipad', 'ipad'],
    iphone: ['ios usb-c – iphone']
  };
  const keywords = mapping[key] || [key];
  const rows = pageData.filter(r => {
    if (!r['Platform']) return false;
    const lower = r['Platform'].toLowerCase();
    return keywords.some(k => lower.includes(k));
  });
  if (!rows || !rows.length) return null;
  const fields = ['USB Max Tiers', 'USB Max Hubs', 'Rec. Stable Tiers', 'Rec. Stable Hubs', 'Max Jumps', 'Dock Recommended (1–5)', 'Stability (1–5)', 'Camera Reliability at Max Jump (1–10)'];
  const agg = { 'Platform': key };
  fields.forEach(f => {
    const valid = rows.map(r => parseRange(r[f]) || {min: getNumericFromCSVField(r[f]), max: getNumericFromCSVField(r[f])}).filter(x => x);
    if (!valid || !valid.length) { agg[f] = ''; return; }
    const minVal = Math.min(...valid.map(v => v.min != null ? v.min : Infinity));
    agg[f] = minVal === Infinity ? '' : String(minVal);
  });
  return agg;
}

function aggregateRowsForPlatformValue(platformValue) {
  if (!platformValue || !pageData || !pageData.length) return null;
  const key = platformValue.toLowerCase();
  const rows = pageData.filter(r => r['Platform'] && r['Platform'].toLowerCase().includes(key));
  if (!rows.length) return null;
  const fields = ['USB Max Tiers', 'USB Max Hubs', 'Rec. Stable Tiers', 'Rec. Stable Hubs', 'Max Jumps', 'Dock Recommended (1–5)', 'Stability (1–5)', 'Camera Reliability at Max Jump (1–10)'];
  const agg = { 'Platform': platformValue };
  fields.forEach(f => {
    const valid = rows.map(r => parseRange(r[f]) || {min: getNumericFromCSVField(r[f]), max: getNumericFromCSVField(r[f])}).filter(x => x);
    if (!valid || !valid.length) { agg[f] = ''; return; }
    const minVal = Math.min(...valid.map(v => v.min != null ? v.min : Infinity));
    agg[f] = minVal === Infinity ? '' : String(minVal);
  });
  return agg;
}

const platformDisplayNames = { mac: 'macOS', windows: 'Windows', linux: 'Linux' };
const platformIcons = {
  windows: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="16" height="16" aria-hidden="true"><rect x="1" y="1" width="10" height="10" fill="#1a73e8" rx="1"/><rect x="13" y="1" width="10" height="10" fill="#1a73e8" rx="1"/><rect x="1" y="13" width="10" height="10" fill="#1a73e8" rx="1"/><rect x="13" y="13" width="10" height="10" fill="#1a73e8" rx="1"/></svg>`,
  mac: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="16" height="16" aria-hidden="true"><path d="M16.3 1.8c-0.8 0.9-1.8 1.4-2.9 1.4-0.1 0-0.4 0-0.6-0.1 0.3-1 0.7-1.9 1.3-2.6 0.6-0.7 1.4-1.3 2.4-1.3 0.1 0.6 0.1 1.4-0.2 2.6z" fill="#34a853"/><path d="M12.4 6.3c1 0 2 0.5 2.9 1.4 0.9 0.9 1.4 1.9 1.4 2.9 0 1.1-0.5 2.1-1.4 3-0.9 0.9-2 1.4-3 1.4-1 0-2-0.5-2.9-1.4-0.9-0.9-1.4-1.9-1.4-3 0-1.1 0.5-2 1.4-2.9 0.9-0.9 1.9-1.4 2.9-1.4z" fill="#34a853"/></svg>`,
  linux: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="16" height="16" aria-hidden="true"><path d="M12 2c2 0 4 2 4 4s-1 4-4 4-4-2-4-4 2-4 4-4z" fill="#ff9800"/><path d="M6 14c0 0 2 4 6 4s6-4 6-4v6c-4 2-8 2-12 0v-6z" fill="#ff9800"/></svg>`
};

const platformStatusLogos = {
  mac: `<svg class="w-6 h-6" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M17.537 12.625a4.421 4.421 0 0 0 2.684 4.047 10.96 10.96 0 0 1-1.384 2.845c-.834 1.218-1.7 2.432-3.062 2.457-1.34.025-1.77-.794-3.3-.794-1.531 0-2.01.769-3.275.82-1.316.049-2.317-1.318-3.158-2.532-1.72-2.484-3.032-7.017-1.27-10.077A4.9 4.9 0 0 1 8.91 6.884c1.292-.025 2.51.869 3.3.869.789 0 2.27-1.075 3.828-.917a4.67 4.67 0 0 1 3.66 1.984 4.524 4.524 0 0 0-2.16 3.805m-2.52-7.432A4.4 4.4 0 0 0 16.06 2a4.482 4.482 0 0 0-2.945 1.516 4.185 4.185 0 0 0-1.061 3.093 3.708 3.708 0 0 0 2.967-1.416Z"/></svg>`,
  windows: `<svg class="w-6 h-6" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path fill="currentColor" fill-rule="evenodd" d="M3.005 12 3 6.408l6.8-.923v6.517H3.005ZM11 5.32 19.997 4v8H11V5.32ZM20.067 13l-.069 8-9.065-1.275L11 13h9.067ZM9.8 19.58l-6.795-.931V13H9.8v6.58Z" clip-rule="evenodd"/></svg>`,
  linux: `<svg class="w-6 h-6" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.35709 16V5.78571c0-.43393.34822-.78571.77777-.78571H18.5793c.4296 0 .7778.35178.7778.78571V16M5.35709 16h-1c-.55229 0-1 .4477-1 1v1c0 .5523.44771 1 1 1H20.3571c.5523 0 1-.4477 1-1v-1c0-.5523-.4477-1-1-1h-1M5.35709 16H19.3571M9.35709 8l2.62501 2.5L9.35709 13m4.00001 0h2"/></svg>`
};

const svgStatusYellow = `<svg class="w-6 h-6" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 13V8m0 8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>`;
const svgStatusGreen = `<svg class="w-6 h-6" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.5 11.5 11 14l4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>`;
const svgStatusSpinner = `<svg class="w-6 h-6" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2a10 10 0 1 0 10 10" opacity="0.4"></path><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2a10 10 0 0 1 10 10"></path></svg>`;

function generatePlatformSummaryHTML(platform, csvRow, info, noteText, isCsvSource) {
  const platformLabel = (platformDisplayNames[platform] || (platform || '').toUpperCase());
  let html = `<strong>Platform Limits for ${escapeHtml(platformLabel)}:</strong><br>`;
  if (csvRow) {
    const maxTiersCSV = csvRow['USB Max Tiers'] || '';
    const maxHubsCSV = csvRow['USB Max Hubs'] || '';
    const recStableTiersCSV = csvRow['Rec. Stable Tiers'] || '';
    const recStableHubsCSV = csvRow['Rec. Stable Hubs'] || '';
    html += `<strong>Max External Hubs:</strong> ${escapeHtml(maxHubsCSV)}<br>`;
    html += `<strong>Max Tiers:</strong> ${escapeHtml(maxTiersCSV)}<br>`;
    html += `<strong>Recommended Stable:</strong> ${escapeHtml(recStableHubsCSV)} hubs, ${escapeHtml(recStableTiersCSV)} tiers<br>`;
  } else if (info) {
    html += `<strong>Max External Hubs:</strong> ${escapeHtml(info.maxHubs)}<br>`;
    html += `<strong>Max Tiers:</strong> ${escapeHtml(info.maxTiers)}<br>`;
  } else {
    html += 'No platform info available.<br>';
  }
  const notesToShow = noteText || '';
  if (notesToShow && csvRow) {
    const formatSentencesBoldFirstLetterHtml = (raw) => {
      if (!raw) return '';
      const esc = escapeHtml(String(raw));
      return esc.replace(/(^|[.!?]\s+|\n\s+|["'\(\[\{\u201C\u2018])([A-Za-zÀ-ÖØ-öø-ÿ])/g, (m, p1, l) => `${p1}<strong>${l}</strong>`);
    };
    const paragraphs = String(notesToShow).split(/\n\s*\n/g).map(p => p.trim()).filter(Boolean);
    const csvNotesHtml = paragraphs.map(p => `<p>${formatSentencesBoldFirstLetterHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
    html += `<details style="margin-top:6px; color:#444; font-size:12px"><summary style="cursor:pointer; font-weight:600">Details</summary><div style="margin-top:6px">${csvNotesHtml}</div></details>`;
  }
  html += `<div style="font-size:11px; color:#666; margin-top:6px">Note: tier calculations are based on the physical port and do not count built-in / virtual hubs.</div>`;
  const src = isCsvSource ? 'CSV' : 'Built-in defaults';
  html += `<div style="font-size:10px; color:#888; margin-top:6px">Source: ${src}</div>`;
  return html;
}

let suppressPlatformChangeClear = false;

const platformSelect = document.getElementById('platform');
const scriptArea = document.getElementById('scriptArea');
const instruction = document.getElementById('instruction');
const scriptButtons = document.getElementById('scriptButtons');
const copyScriptButton = document.getElementById('copyScriptButton');
const noAdminButton = document.getElementById('noAdminButton');
const resultInput = document.getElementById('resultInput');
const platformLimits = document.getElementById('platformLimits');

platformSelect.addEventListener('change', function() {
  const platform = this.value;
  if (!suppressPlatformChangeClear) {
    resultInput.value = '';
  }
  if (platform) {
    const scriptElement = document.getElementById(platform + 'Script');
    if (scriptElement) {
      scriptArea.textContent = scriptElement.value;
      scriptArea.classList.add('active');
      instruction.textContent = instructions[platform];
      instruction.classList.add('active');
      scriptButtons.style.display = 'flex';
      if (platform === 'windows') {
        copyScriptButton.classList.remove('full-width');
        copyScriptButton.classList.add('split-width');
        noAdminButton.style.display = 'block';
      } else {
        copyScriptButton.classList.remove('split-width');
        copyScriptButton.classList.add('full-width');
        noAdminButton.style.display = 'none';
      }
    }
  } else {
    scriptArea.textContent = '';
    scriptArea.classList.remove('active');
    instruction.textContent = '';
    instruction.classList.remove('active');
    scriptButtons.style.display = 'none';
  }
  updatePlatformHint(platform);
  try {
    const key = platform || 'default';
    if (resultInput) resultInput.placeholder = resultInputPlaceholders[key];
  } catch(e) {}
  cleanAndDisplay();
  updateCsvStatusIndicator(platform);
});

function shouldFloatHint() {
  try {
    const minWidth = 1200;
    if (window.innerWidth < minWidth) return false;
    const container = document.querySelector('.container');
    if (!container) return true;
    const rect = container.getBoundingClientRect();
    const requiredRightSpace = 360;
    return (rect.right + requiredRightSpace <= window.innerWidth);
  } catch (e) {
    return true;
  }
}

function updatePlatformHint(platform) {
  const floating = document.getElementById('floatingHint');
  const floatingTitle = document.getElementById('floatingHintTitle');
  const floatingContent = document.getElementById('floatingHintContent');
  const csvActualRow = pageDataLoaded ? (findPageDataRowForPlatform(platform) || aggregateRowsForPlatformValue(platform)) : null;
  const notes = csvActualRow && csvActualRow['Notes'] ? csvActualRow['Notes'] : null;
  const noteText = notes;
  const uiRow = csvActualRow;
  const info = (!csvActualRow && platformInfo[platform]) ? platformInfo[platform] : null;
  const container = document.getElementById('platformLimits');
  const hasContent = !!(uiRow || noteText || info);
  let showFloating = hasContent && shouldFloatHint();
  const pageDataDialog = document.getElementById('pageDataDialog');
  const scriptDialog = document.getElementById('scriptDialog');
  const anyModalOpen = (pageDataDialog && pageDataDialog.style.display === 'block') || (scriptDialog && scriptDialog.style.display === 'block');
  if (anyModalOpen) showFloating = false;
  if (!platform || !hasContent) {
    if (floating) {
      floating.classList.remove('visible');
      setTimeout(() => {
        floating.style.display = 'none';
        floating.setAttribute('aria-hidden', 'true');
        floatingContent.innerHTML = '';
        floatingTitle.textContent = '';
        floating.className = 'floating-hint';
      }, 220);
    }
    container.innerHTML = '';
    if (container) container.classList.remove('windows', 'mac', 'linux');
    container.classList.remove('active');
    return;
  }
  const isCsvSource = !!csvActualRow;
  let summaryHTML = generatePlatformSummaryHTML(platform, uiRow, info, noteText, isCsvSource);
  if (!summaryHTML || String(summaryHTML).trim() === '') {
    summaryHTML = `<strong>Platform Limits for ${escapeHtml(platformDisplayNames[platform] || platform.toUpperCase())}:</strong><br>No platform information available.`;
  }
  if (showFloating) {
    if (floating) {
      floating.className = `floating-hint ${platform}`.trim();
      const icon = platformStatusLogos[platform] || platformIcons[platform] || '';
      floatingTitle.innerHTML = `<span class='floating-logo'>${icon}</span><span class='floating-title-text'>${escapeHtml(platformDisplayNames[platform] || platform.toUpperCase())} - Tips</span>`;
      floatingContent.innerHTML = `<div class="platform-limits">${summaryHTML}</div>`;
      try { floatingContent.querySelectorAll('details').forEach(d => d.open = true); } catch(e) {}
      floating.style.display = 'block';
      requestAnimationFrame(() => floating.classList.add('visible'));
      floating.setAttribute('aria-hidden', 'false');
    }
    container.innerHTML = '';
    container.classList.remove('windows', 'mac', 'linux');
    container.classList.remove('active');
  } else {
    if (floating) {
      floating.classList.remove('visible');
      setTimeout(() => {
        floating.style.display = 'none';
        floating.setAttribute('aria-hidden', 'true');
        floatingContent.innerHTML = '';
        floatingTitle.textContent = '';
        floating.className = 'floating-hint';
      }, 220);
    }
    const headerIcon = platformStatusLogos[platform] || platformIcons[platform] || '';
    const headerHTML = `<div class="platform-limits-header"><span class="platform-status-icon">${headerIcon}</span><span class="platform-title-text">${escapeHtml(platformDisplayNames[platform] || platform.toUpperCase())} - Tips</span></div>`;
    container.innerHTML = headerHTML + summaryHTML;
    try { container.querySelectorAll('details').forEach(d => d.open = false); } catch(e) {}
    container.classList.remove('windows', 'mac', 'linux');
    if (platform) container.classList.add(platform);
    container.classList.toggle('active', !!summaryHTML);
  }
  updateCsvStatusIndicator(platform);
}

const CSV_COLLAPSE_BREAKPOINT = 820;
let csvIndicatorExpanded = true;

function applyCsvIndicatorState(indicator) {
  if (!indicator) return;
  indicator.classList.toggle('collapsed', !csvIndicatorExpanded);
  indicator.classList.toggle('expanded', csvIndicatorExpanded);
  indicator.setAttribute('aria-expanded', csvIndicatorExpanded ? 'true' : 'false');
}

function shouldCollapseCsvIndicator() {
  return window.innerWidth < CSV_COLLAPSE_BREAKPOINT;
}

function updateCsvStatusIndicator(platform) {
  try {
    const indicator = document.getElementById('csvIndicator');
    const platformIconEl = document.getElementById('csvPlatformIcon');
    const statusTextEl = document.getElementById('csvStatusText');
    const statusIconEl = document.getElementById('csvStatusIcon');
    if (!indicator || !platformIconEl || !statusTextEl || !statusIconEl) return;
    const p = platform || (document.getElementById('platform') && document.getElementById('platform').value) || null;
    platformIconEl.innerHTML = p && platformStatusLogos[p] ? platformStatusLogos[p] : '';
    let csvRow = null;
    // If the page data is currently being loaded, show a spinner and loading message
    try {
      if (pageDataLoading) {
        indicator.classList.add('loading');
        indicator.classList.remove('csv-green');
        indicator.classList.add('csv-yellow');
        statusTextEl.textContent = pageDataStatusMessage || 'Loading CSV...';
        statusIconEl.innerHTML = svgStatusSpinner;
        platformIconEl.innerHTML = '';
        indicator.style.display = 'flex';
        applyCsvIndicatorState(indicator);
        return;
      } else {
        indicator.classList.remove('loading');
      }
    } catch (e) {}
    if (pageDataLoaded) {
      csvRow = findPageDataRowForPlatform(p) || aggregateRowsForPlatformValue(p) || null;
    }
    if (pageDataLoaded && csvRow) {
      indicator.classList.remove('csv-yellow');
      indicator.classList.add('csv-green');
      statusTextEl.textContent = 'CSV data is being used.';
      statusIconEl.innerHTML = svgStatusGreen;
      platformIconEl.innerHTML = '';
      indicator.style.display = 'flex';
    } else {
      indicator.classList.remove('csv-green');
      indicator.classList.add('csv-yellow');
      if (!pageDataLoaded) {
        statusTextEl.textContent = 'CSV could not load, using backup data.';
      } else {
        statusTextEl.textContent = 'CSV loaded but no data for this platform; using backup data.';
      }
      statusIconEl.innerHTML = svgStatusYellow;
      platformIconEl.innerHTML = '';
      indicator.style.display = 'flex';
    }
    indicator.classList.add('visible');
    if (shouldCollapseCsvIndicator()) {
      csvIndicatorExpanded = false;
    }
    applyCsvIndicatorState(indicator);
  } catch (e) {
    // ignore errors
  }
}

window.addEventListener('resize', function() {
  const selected = document.getElementById('platform').value;
  updatePlatformHint(selected);
  if (shouldCollapseCsvIndicator()) {
    csvIndicatorExpanded = false;
  } else {
    csvIndicatorExpanded = true;
  }
  applyCsvIndicatorState(document.getElementById('csvIndicator'));
});

function copyScript() {
  const platform = document.getElementById('platform').value;
  if (platform) {
    const scriptElement = document.getElementById(platform + 'Script');
    if (scriptElement) {
      const script = scriptElement.value;
      try {
        navigator.clipboard.writeText(script).then(() => {
          alert('Script copied to clipboard!');
        }).catch(err => {
          const tempInput = document.createElement('textarea');
          tempInput.value = script;
          document.body.appendChild(tempInput);
          tempInput.select();
          document.execCommand('copy');
          document.body.removeChild(tempInput);
          alert('Script copied to clipboard!');
        });
      } catch (err) {
        alert('Failed to copy script. Please copy manually.');
      }
    }
  }
}

function copyNoAdminScript() {
  const scriptElement = document.getElementById('windowsNoAdminScript');
  if (scriptElement) {
    const script = scriptElement.value;
    try {
      navigator.clipboard.writeText(script).then(() => {
        alert('No Admin Script copied to clipboard!');
      }).catch(err => {
        const tempInput = document.createElement('textarea');
        tempInput.value = script;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
        alert('No Admin Script copied to clipboard!');
      });
    } catch (err) {
      alert('Failed to copy script. Please copy manually.');
    }
  }
}

function buildGraphHTML(nodes) {
  let html = '<ul>';
  nodes.forEach(node => {
    let className = node.isHub ? 'hub-node' : 'device-node';
    const nodeName = (node.name || '').toLowerCase();
    if (nodeName.includes('xhci') || nodeName.includes('root_hub') || nodeName.includes('root hub') || nodeName.includes('usbxhc') || nodeName.includes('usbxhci')) {
      className += ' root-node';
    }
    if (node.isVirtualHub) {
      className += ' virtual-hub';
    }
    let status = '';
    const depthForStatus = typeof node.normDepth !== 'undefined' ? node.normDepth : node.depth;
    if (depthForStatus > 5) {
      className += ' notworking-node';
      status = '[NOT WORKING]';
    } else if (depthForStatus > 3) {
      className += ' unstable-node';
      status = '[UNSTABLE]';
    }
    const displayName = node.isVirtualHub ? `${node.name} (Virtual hub)` : node.name;
    html += `<li><span class="node ${className}"><b>[${node.isHub ? 'HUB' : 'DEVICE'}]</b> ${escapeHtml(displayName)}</span> <span class="status">${status}</span>`;
    if (node.children.length > 0) {
      html += buildGraphHTML(node.children);
    }
    html += '</li>';
  });
  html += '</ul>';
  return html;
}

function getPlatformStatus(maxJumps, platformType) {
  let status;
  switch(platformType) {
    case 'windows':
      if (maxJumps <= 3) status = 'Stable';
      else if (maxJumps <= 5) status = '<span style="font-weight: bold;">Unstable</span>';
      else status = '<span style="font-weight: bold;">Not working</span>';
      break;
    case 'macAppleSilicon':
      if (maxJumps <= 2) status = 'Stable';
      else if (maxJumps <= 4) status = '<span style="font-weight: bold;">Unstable</span>';
      else status = '<span style="font-weight: bold;">Not working</span>';
      break;
    case 'macIntel':
      if (maxJumps <= 3) status = 'Stable';
      else if (maxJumps <= 5) status = '<span style="font-weight: bold;">Unstable</span>';
      else status = '<span style="font-weight: bold;">Not working</span>';
      break;
    case 'linux':
      if (maxJumps <= 3) status = 'Stable';
      else if (maxJumps <= 5) status = '<span style="font-weight: bold;">Unstable</span>';
      else status = '<span style="font-weight: bold;">Not working</span>';
      break;
    default:
      status = 'Stable';
  }
  return status;
}

function cleanAndDisplay() {
  let raw = resultInput.value;
  const treeOutput = document.getElementById('treeOutput');
  const summaryOutput = document.getElementById('summaryOutput');
  const graphOutput = document.getElementById('graphOutput');
  const outputContainer = document.querySelector('.output');
  const treeHeader = document.getElementById('treeHeader');
  const summaryHeader = document.getElementById('summaryHeader');
  const graphHeader = document.getElementById('graphHeader');
  const graphExplanation = document.getElementById('graphExplanation');
  try {
    const detected = detectPlatformFromPaste(raw);
    if (detected && detected !== platformSelect.value) {
      suppressPlatformChangeClear = true;
      platformSelect.value = detected;
      platformSelect.dispatchEvent(new Event('change'));
      suppressPlatformChangeClear = false;
    }
  } catch (e) {}
  const platform = platformSelect.value;
  if (raw && raw.trim() && !platform) {
    const chooseMessage = 'Please choose your platform from the dropdown above. After selecting the platform, follow the platform-specific instructions shown here to properly paste the terminal output. If you\'d prefer, we can attempt to auto-detect the platform from the pasted logs.';
    instruction.textContent = chooseMessage;
    instruction.classList.add('active');
    scriptArea.textContent = '';
    scriptArea.classList.remove('active');
    scriptButtons.style.display = 'none';
    treeOutput.classList.remove('active');
    summaryOutput.classList.remove('active');
    graphOutput.classList.remove('active');
    treeHeader.classList.remove('active');
    summaryHeader.classList.remove('active');
    graphHeader.classList.remove('active');
    graphExplanation.classList.remove('active');
    if (outputContainer) outputContainer.classList.remove('active');
    treeOutput.textContent = '';
    summaryOutput.innerHTML = '';
    graphOutput.innerHTML = '';
    return;
  }
  if (!raw.trim() || !platform) {
    treeOutput.classList.remove('active');
    summaryOutput.classList.remove('active');
    graphOutput.classList.remove('active');
    treeHeader.classList.remove('active');
    summaryHeader.classList.remove('active');
    graphHeader.classList.remove('active');
    graphExplanation.classList.remove('active');
    if (outputContainer) outputContainer.classList.remove('active');
    treeOutput.textContent = '';
    summaryOutput.innerHTML = '';
    graphOutput.innerHTML = '';
    return;
  } else {
    treeOutput.classList.add('active');
    summaryOutput.classList.add('active');
    graphOutput.classList.add('active');
    treeHeader.classList.add('active');
    summaryHeader.classList.add('active');
    graphHeader.classList.add('active');
    graphExplanation.classList.add('active');
    if (outputContainer) outputContainer.classList.add('active');
    if (typeof resultInput !== 'undefined' && resultInput) {
      try {
        resultInput.scrollIntoView({ behavior: 'smooth', block: 'end' });
      } catch (e) {}
    }
  }
  raw = raw.replace(/Last login:.*\n/g, '');
  raw = raw.replace(/PS [^\n]*>\n/g, '');
  raw = raw.replace(/^.*%\s*/gm, '');
  raw = raw.replace(/sudo:.*\n/g, '');
  raw = raw.replace(/^\s*[\r\n]/gm, '');
  let lines = raw.split('\n').filter(line => line.trim() !== '');
  let tree = [];
  let maxJumps = 0;
  let output = '';
  let summary = '';
  let graph = '';
  if (platform === 'windows') {
    let stack = [];
    lines.forEach(line => {
      const match = line.match(/^(\s*)- (.+) \((.+)\)$/);
      if (match) {
        const indent = match[1];
        const name = match[2];
        const deviceId = match[3];
        const level = Math.floor(indent.length / 2);
        const lowerName = (name || '').toLowerCase();
        const isHub = lowerName.includes('hub') || 
                     deviceId.toLowerCase().includes('root_hub') ||
                     deviceId.toLowerCase().includes('hub') ||
                     lowerName.includes('xhci') || lowerName.includes('usbxhci') || lowerName.includes('usb host controller');
        const isVirtualHub = (lowerName.includes('apple') && (lowerName.includes('xhci') || lowerName.includes('usbxhci'))) ||
                             lowerName.includes('virtual') || lowerName.includes('built-in') || lowerName.includes('bridge');
        let node = {
          name: name + ' (' + deviceId + ')',
          isHub: isHub,
          isVirtualHub: isVirtualHub,
          countsAsTier: isHub && !isVirtualHub,
          children: [],
          depth: level
        };
        while (stack.length > level) {
          stack.pop();
        }
        if (level === 0) {
          tree.push(node);
        } else {
          if (stack.length > 0) {
            stack[stack.length - 1].children.push(node);
          }
        }
        stack.push(node);
        maxJumps = Math.max(maxJumps, level);
      }
    });
  } else if (platform === 'mac') {
    let stack = [];
    lines.forEach(line => {
      if (!line.startsWith('+-o') && !line.startsWith('  ')) return;
      let indent = line.search(/\+-o/);
      if (indent === -1) return;
      let level = indent / 2;
      let fullName = line.replace(/^\s*\+-o\s*/, '').split('<')[0].trim();
      let name = fullName.split(' @')[0].trim();
      let loc = fullName.includes('@') ? ' @' + fullName.split('@')[1] : '';
      const lowerName = (name || '').toLowerCase();
      let isHub = lowerName.includes('hub') || lowerName.includes('root');
      isHub = isHub || lowerName.includes('xhci') || lowerName.includes('usbxhci') || lowerName.includes('usb host controller');
      const isVirtualHub = (lowerName.includes('apple') && (lowerName.includes('xhci') || lowerName.includes('usbxhci'))) || lowerName.includes('virtual') || lowerName.includes('built-in') || lowerName.includes('bridge');
      let node = {name: name + loc, isHub, isVirtualHub, countsAsTier: isHub && !isVirtualHub, children: [], depth: level};
      while (stack.length > level) {
        stack.pop();
      }
      if (level === 0) {
        tree.push(node);
      } else {
        stack[stack.length - 1].children.push(node);
      }
      stack.push(node);
      maxJumps = Math.max(maxJumps, level);
    });
  } else if (platform === 'linux') {
    let stack = [];
    lines.forEach(line => {
      let indent = line.search(/\S/);
      let level = Math.floor(indent / 4);
      let content = line.trim();
      let name;
      let isHub;
      let isVirtualHub = false;
      if (content.startsWith('/:')) {
        level = 0;
        name = content.replace('/:', '').trim();
        const lowerName = (name || '').toLowerCase();
        isHub = lowerName.includes('root_hub') || lowerName.includes('hub');
        isHub = isHub || lowerName.includes('xhci') || lowerName.includes('usbxhci') || lowerName.includes('usb host controller');
        isVirtualHub = (lowerName.includes('apple') && (lowerName.includes('xhci') || lowerName.includes('usbxhci'))) || lowerName.includes('virtual') || lowerName.includes('built-in') || lowerName.includes('bridge');
      } else {
        content = content.replace(/\|__/, '').trim();
        content = content.replace(/\|/g, '').trim();
        name = content;
        isHub = content.toLowerCase().includes('hub');
      }
      let node = {name, isHub, isVirtualHub, countsAsTier: isHub && !isVirtualHub, children: [], depth: level};
      while (stack.length > level) {
        stack.pop();
      }
      if (level === 0) {
        tree.push(node);
      } else {
        stack[stack.length - 1].children.push(node);
      }
      stack.push(node);
      maxJumps = Math.max(maxJumps, level);
    });
  }
  if (tree.length > 0) {
    function findControllerMinDepth(nodes) {
      let min = Infinity;
      nodes.forEach(n => {
        const name = (n.name || '').toLowerCase();
        if ((name.includes('xhci') || name.includes('usbxhci') || name.includes('root_hub') || name.includes('root hub') || name.includes('usb host controller') || name.includes('controller'))
            || (name.includes('apple') && (name.includes('xhci') || name.includes('usbxhci')))) {
          min = Math.min(min, n.depth);
        }
        if (n.children && n.children.length) {
          const sub = findControllerMinDepth(n.children);
          if (sub !== Infinity) min = Math.min(min, sub);
        }
      });
      return min === Infinity ? null : min;
    }
    const baseDepth = findControllerMinDepth(tree) || 0;
    function findCountsAsTierMinDepth(nodes, baseDepthLimit) {
      let min = Infinity;
      nodes.forEach(n => {
        if (n.countsAsTier && (typeof baseDepthLimit === 'undefined' || n.depth > baseDepthLimit)) min = Math.min(min, n.depth);
        if (n.children && n.children.length) {
          const sub = findCountsAsTierMinDepth(n.children, baseDepthLimit);
          if (sub !== Infinity) min = Math.min(min, sub);
        }
      });
      return min === Infinity ? null : min;
    }
    const portBaseDepth = findCountsAsTierMinDepth(tree, baseDepth) || baseDepth || 0;
    let normMaxJumps = 0;
    let devicesList = [];
    let extHubsList = [];
    let builtInHubsList = [];
    let treeVisual = [];
    let numHubs = 0;
    let numDevices = 0;
    let maxHubJumps = 0;
    function traverse(node, parentHubCount = 0) {
      let indent = '  '.repeat(typeof node.normDepth !== 'undefined' ? node.normDepth : node.depth);
      const isCountedHub = !!(node.isHub && node.countsAsTier && node.depth >= portBaseDepth);
      const currentHubCount = parentHubCount + (isCountedHub ? 1 : 0);
      const normDepth = currentHubCount;
      node.normDepth = normDepth;
      if (normDepth > maxHubJumps) maxHubJumps = normDepth;
      let symbol = node.isHub ? 'HUB' : 'DEVICE';
      let status = normDepth > 5 ? '[NOT WORKING]' : normDepth > 3 ? '[UNSTABLE]' : '';
      const displayName = node.isVirtualHub ? `${node.name} (Virtual hub)` : node.name;
      treeVisual.push(`${indent}${node.children.length ? '├──' : '└──'} [${symbol}] ${displayName} ${status}`);
      if (node.isHub) {
        if (node.countsAsTier) numHubs++;
        let deviceCount = node.children.filter(c => !c.isHub).length;
        if (node.countsAsTier) {
          extHubsList.push(`${node.name} (depth ${normDepth}): ${deviceCount} devices`);
        } else {
          builtInHubsList.push(`${node.name} (depth ${normDepth}): ${deviceCount} devices — built-in / virtual`);
        }
      } else if (!node.isHub && node.depth >= portBaseDepth) {
        numDevices++;
        devicesList.push(`${node.name} - ${normDepth} jumps`);
      }
      node.children.forEach((child, index) => {
        traverse(child, currentHubCount);
      });
    }
    tree.forEach(node => traverse(node));
    normMaxJumps = maxHubJumps;
    let numTiers = Math.max(1, normMaxJumps + 1);
    output += 'Devices connected and jumps from computer:\n' + (devicesList.length > 0 ? devicesList.join('\n') : 'None') + '\n\n';
    output += 'External hubs and connected devices:\n' + (extHubsList.length > 0 ? extHubsList.join('\n') : 'None') + '\n\n';
    if (builtInHubsList.length) {
      output += 'Built-in / Virtual hubs:\n' + builtInHubsList.join('\n') + '\n\n';
    }
    output += `Jumps to furthest device: ${normMaxJumps}\n`;
    output += `Number of tiers: ${Math.max(1, normMaxJumps + 1)}\n\n`;
    output += 'Tree structure:\n' + treeVisual.join('\n');
    function findAnyVirtualHub(nodes) {
      for (const n of nodes) {
        if (n.isVirtualHub && n.depth >= baseDepth) return true;
        if (n.children && n.children.length) {
          if (findAnyVirtualHub(n.children)) return true;
        }
      }
      return false;
    }
    const hostHasBuiltInHub = findAnyVirtualHub(tree);
    const hostCsvRow = getRowForPlatform(platform);
    let hostSummary = `<strong>This device (host):</strong><br>`;
    if (hostCsvRow) {
      const hostMaxTiers = hostCsvRow['USB Max Tiers'] || '';
      const hostMaxHubs = hostCsvRow['USB Max Hubs'] || '';
      const hostRecTiers = hostCsvRow['Rec. Stable Tiers'] || '';
      const hostRecHubs = hostCsvRow['Rec. Stable Hubs'] || '';
      hostSummary += `Platform: ${escapeHtml(hostCsvRow['Platform'] || platform)}<br>`;
      hostSummary += `Host USB Max Tiers: ${hostMaxTiers} | Host USB Max Hubs: ${hostMaxHubs}<br>`;
      hostSummary += `Recommended stable: ${hostRecHubs} hubs, ${hostRecTiers} tiers<br>`;
    } else {
      hostSummary += `Platform: ${escapeHtml(platform || 'Unknown')}<br>`;
    }
    hostSummary += `Built-in hub present: ${hostHasBuiltInHub ? 'Yes' : 'No'}<br>`;
    const hostCsvActualRow = pageDataLoaded ? (findPageDataRowForPlatform(platform) || aggregateRowsForPlatformValue(platform)) : null;
    hostSummary += `Source: ${hostCsvActualRow ? 'CSV' : 'Built-in defaults'}<br>`;
    if (hostCsvRow) {
      const hostFallbackType = (function(){
        const p = platform || '';
        if (hostCsvRow && hostCsvRow['Platform'] && hostCsvRow['Platform'].toLowerCase().includes('apple silicon')) return 'macAppleSilicon';
        if (p === 'mac') return 'macAppleSilicon';
        if (p === 'linux') return 'linux';
        if (p === 'windows') return 'windows';
        return 'windows';
      })();
      const hostStatus = getPlatformStatusFromCsv(normMaxJumps, hostCsvRow, hostFallbackType);
      hostSummary += `Host status for this port: ${hostStatus}<br><br>`;
    } else {
      hostSummary += `<br>`;
    }
    summary += `<strong>From port (physical):</strong><br>`;
    summary += `Furthest jumps: ${normMaxJumps}<br>`;
    summary += `Number of tiers: ${Math.max(1, normMaxJumps + 1)}<br>`;
    summary += `Number of hubs: ${numHubs}<br>`;
    summary += `Total devices: ${numDevices}<br><br>`;
    const selectedCsvRow = getRowForPlatform(platform);
    const categories = [
      { key: 'windows', label: 'Windows' },
      { key: 'macAppleSilicon', label: 'Mac Apple Silicon' },
      { key: 'macIntel', label: 'Mac Intel' },
      { key: 'linux', label: 'Linux' },
      { key: 'androidPhone', label: 'Android Phone' },
      { key: 'androidTablet', label: 'Android Tablet' },
      { key: 'ipad', label: 'iPad USB-C' },
      { key: 'iphone', label: 'iPhone USB-C' }
    ];
    let platformStatusesSummary = '';
    categories.forEach(cat => {
      let agg = aggregateRowsForCategory(cat.key);
      if (!agg) {
        const map = {
          'windows': 'windows',
          'macAppleSilicon': 'mac',
          'macIntel': 'mac',
          'linux': 'linux',
          'androidPhone': null,
          'androidTablet': null,
          'ipad': null,
          'iphone': null
        };
        const fallbackPlatformKey = map[cat.key] || null;
        if (fallbackPlatformKey) {
          agg = buildPlatformRowFromInfo(fallbackPlatformKey);
        } else {
          agg = null;
        }
      }
      let status;
      if (agg) {
        status = getPlatformStatusFromCsv(normMaxJumps, agg, cat.key);
      } else {
        switch (cat.key) {
          case 'windows': status = getPlatformStatus(normMaxJumps, 'windows'); break;
          case 'macAppleSilicon': status = getPlatformStatus(normMaxJumps, 'macAppleSilicon'); break;
          case 'macIntel': status = getPlatformStatus(normMaxJumps, 'macIntel'); break;
          case 'linux': status = getPlatformStatus(normMaxJumps, 'linux'); break;
          default: status = 'Stable';
        }
      }
      const isSelected = selectedCsvRow && (() => {
        const p = (selectedCsvRow['Platform'] || '').toLowerCase();
        const keywords = (function(k) {
          switch (cat.key) {
            case 'windows': return ['pc x86','pc arm','pc','windows'];
            case 'macAppleSilicon': return ['mac apple silicon','apple silicon'];
            case 'macIntel': return ['mac intel'];
            case 'linux': return ['linux'];
            case 'androidPhone': return ['android phone'];
            case 'androidTablet': return ['android tablet'];
            case 'ipad': return ['ios usb-c – ipad','ipad m-series','ipad'];
            case 'iphone': return ['ios usb-c – iphone','iphone'];
            default: return [];
          }
        })(cat.key);
        return keywords.some(k => p.includes(k));
      })();
      const disp = isSelected ? `<strong>${escapeHtml(cat.label)}</strong>` : escapeHtml(cat.label);
      platformStatusesSummary += `${disp}: ${status}<br>`;
    });
    summary += platformStatusesSummary + '\n';
    summary = hostSummary + summary;
    if (selectedCsvRow) {
      const maxTiersRow = selectedCsvRow['USB Max Tiers'];
      const maxHubsRow = selectedCsvRow['USB Max Hubs'];
      const recStableTiersRow = selectedCsvRow['Rec. Stable Tiers'];
      const recStableHubsRow = selectedCsvRow['Rec. Stable Hubs'];
      summary += `Based on selected platform: USB Max Tiers: ${maxTiersRow} | USB Max Hubs: ${maxHubsRow} | Recommended Stable: ${recStableHubsRow} hubs, ${recStableTiersRow} tiers\n`;
      const selFallbackType = (function(){
        const p = platform || '';
        if (p === 'mac') return 'macAppleSilicon';
        if (p === 'linux') return 'linux';
        if (p === 'windows') return 'windows';
        return 'windows';
      })();
      const selStatus = getPlatformStatusFromCsv(normMaxJumps, selectedCsvRow, selFallbackType);
      summary += `Selected platform status: ${selStatus}\n`;
    } else {
      if (!pageDataLoaded) {
        if (platform === 'mac') {
          summary += 'Apple Silicon: Built-in hub per USB-C port consumes one tier and reduces the number of available external hubs.\n';
        } else {
          summary += 'USB spec allows max 5 jumps (tiers)\n';
        }
      }
    }
    let troubleshooting = '';
    if (typeof normMaxJumps !== 'undefined' && (normMaxJumps > 3 || platform === 'mac')) {
      if (normMaxJumps > 3) {
        troubleshooting += '- Check for high-power or incompatible devices (e.g., non-standard USB devices).\n';
      }
      if (selectedCsvRow) {
        const recTiers = parseRange(selectedCsvRow['Rec. Stable Tiers']);
        const recHubs = parseRange(selectedCsvRow['Rec. Stable Hubs']);
        const dockRecommended = selectedCsvRow['Dock Recommended (1–5)'];
        if (recTiers && (numTiers > recTiers.max)) {
          troubleshooting += `- Exceeds recommended stable tiers (${recTiers.max}). Reduce hubs/tiers or connect devices closer to the computer.\n`;
        }
        if (recHubs && (numHubs > recHubs.max)) {
          troubleshooting += `- More hubs (${numHubs}) than recommended stable hubs (${recHubs.max}). Try reducing hubs, or use a powered hub/dock.\n`;
        }
        if (dockRecommended) {
          troubleshooting += `- Dock recommendation (1–5): ${dockRecommended}. Higher is better. Consider using a dock if recommended.\n`;
        }
        if (platform === 'mac' && selectedCsvRow['Platform'] && selectedCsvRow['Platform'].toLowerCase().includes('apple silicon')) {
          troubleshooting += '- Apple Silicon has stricter hub limits per USB-C port. Use Thunderbolt docks to bypass hub limits.\n';
        }
      } else {
        if (platform === 'mac' && normMaxJumps > 2) {
          troubleshooting += '- Use Thunderbolt docks for multi-device setups to bypass USB hub limits.\n';
        }
      }
    }
    if (troubleshooting) {
      summary += '\nTroubleshooting Tips:\n';
      summary += troubleshooting;
    }
    graph = buildGraphHTML(tree);
  } else {
    output = 'No valid USB tree data found. Please check your terminal output.';
    summary = 'No valid USB tree data found.';
    graph = 'No valid USB tree data found.';
  }
  treeOutput.textContent = output;
  summaryOutput.innerHTML = summary;
  graphOutput.innerHTML = graph;
}

document.addEventListener('DOMContentLoaded', function() {
  autoDetectPlatform();
  try {
    const detectedPlatform = document.getElementById('platform').value || '';
    const placeholderKey = detectedPlatform || 'default';
    const resultInputEl = document.getElementById('resultInput');
    if (resultInputEl) resultInputEl.placeholder = resultInputPlaceholders[placeholderKey];
  } catch (e) {}
  if (typeof reloadPageData === 'function') {
    reloadPageData();
  }
  const csvIndicatorEl = document.getElementById('csvIndicator');
  if (csvIndicatorEl) {
    csvIndicatorExpanded = !shouldCollapseCsvIndicator();
    applyCsvIndicatorState(csvIndicatorEl);
    csvIndicatorEl.addEventListener('click', function(e) {
      e.stopPropagation();
      if (shouldCollapseCsvIndicator()) {
        csvIndicatorExpanded = !csvIndicatorExpanded;
      } else {
        csvIndicatorExpanded = true;
      }
      applyCsvIndicatorState(csvIndicatorEl);
    });
    document.addEventListener('click', function(e) {
      if (!csvIndicatorEl.contains(e.target) && shouldCollapseCsvIndicator()) {
        csvIndicatorExpanded = false;
        applyCsvIndicatorState(csvIndicatorEl);
      }
    });
  }
  const pageDataDialog = document.getElementById('pageDataDialog');
  if (pageDataDialog) {
    pageDataDialog.addEventListener('click', function(e) {
      if (e.target === pageDataDialog) {
        closePageDataDialog();
      }
    });
  }
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      if (pageDataDialog && pageDataDialog.style.display === 'block') {
        closePageDataDialog();
      }
    }
  });
});

resultInput.addEventListener('input', cleanAndDisplay);
