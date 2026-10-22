export const formatReceiptText = (storeProfile, transaction, cart, totals) => {
  const WIDTH = 32;

  const padRight = (str, len) => (str + " ".repeat(Math.max(0, len))).substring(0, len);
  const padLeft = (str, len) => (" ".repeat(Math.max(0, len)) + str).slice(-len);
  
  const formatCurrency = (num) => "Rp " + Number(num || 0).toLocaleString('id-ID');

  let text = "";
  
  // Header
  text += '\x1B\x61\x01'; // Center align
  text += (storeProfile?.store_name || "Store") + "\n";
  if (storeProfile?.address) text += storeProfile.address + "\n";
  if (storeProfile?.phone) text += storeProfile.phone + "\n";
  text += "-".repeat(WIDTH) + "\n";
  
  let custName = transaction.customer_name || "Guest";
  let txNote = transaction.transaction_note || "";
  if (custName && !txNote) {
    const txNoteMatch = custName.match(/ - Note: ([\s\S]*)$/);
    if (txNoteMatch) {
      txNote = txNoteMatch[1];
      custName = custName.replace(/\s*- Note: [\s\S]*$/, "");
    }
  } else if (txNote && custName.includes(" - Note: ")) {
    // Strip it from custName if explicitly provided but also baked in (from POS.jsx)
    custName = custName.replace(/\s*- Note: [\s\S]*$/, "");
  }

  text += '\x1B\x61\x00'; // Left align
  text += `Inv : #${transaction.invoice_no}\n`;
  text += `Date: ${transaction.date}\n`;
  text += `Cust: ${custName}\n`;
  text += `Type: ${transaction.table_no}\n`;
  text += "-".repeat(WIDTH) + "\n";

  // Items
  cart.forEach(item => {
    let name = item.menu_name || "";
    let note = item.note || "";
    
    const noteMatch = name.match(/\(Note: (.*?)\)$/);
    if (noteMatch) {
      note = noteMatch[1] || note;
      name = name.replace(/\s*\(Note: .*?\)$/, "");
    }

    
    let drinkType = item.drink_type || "";
    let sugarLevel = item.sugar_level || "";
    
    const drinkMatch = name.match(/\[(Hot|Ice)\]/);
    if (drinkMatch) {
        drinkType = drinkMatch[1] || drinkType;
        name = name.replace(/\s*\[(?:Hot|Ice)\]/, "");
    }
    
    const sugarMatch = name.match(/\[(.*?) Sugar\]/);
    if (sugarMatch) {
        sugarLevel = sugarMatch[1] || sugarLevel;
        name = name.replace(/\s*\[.*? Sugar\]/, "");
    }

    // Print name in BOLD, handling word wrap if needed, or simple cutoff
    text += '\x1B\x45\x01'; // Bold on
    text += name.substring(0, WIDTH) + "\n";
    text += '\x1B\x45\x00'; // Bold off
    
    if (drinkType || sugarLevel) {
      let tempArr = [];
      if (drinkType) tempArr.push(drinkType);
      if (sugarLevel) tempArr.push(`${sugarLevel} Sugar`);
      if (tempArr.length > 0) {
        text += `   - ${tempArr.join(", ")}`.substring(0, WIDTH) + "\n";
      }
    }
    
    if (note) {
      text += `   * Note: ${note}`.substring(0, WIDTH) + "\n";
    }
    if (item.addons && item.addons.length > 0) {
      item.addons.forEach(a => {
        text += `   + Addon: ${a.name}`.substring(0, WIDTH) + "\n";
      });
    }
    
    // Qty x Price     Subtotal
    let qtyPrice = `  ${item.qty}x ${formatCurrency(item.price)}`;
    if (item.is_auto_free) qtyPrice += " (FREE)";
    let subtotal = formatCurrency(item.subtotal);
    
    const spaces = WIDTH - qtyPrice.length - subtotal.length;
    if (spaces > 0) {
      text += qtyPrice + " ".repeat(spaces) + subtotal + "\n";
    } else {
      text += qtyPrice + "\n" + padLeft(subtotal, WIDTH) + "\n";
    }
  });

  text += "-".repeat(WIDTH) + "\n";
  
  // Totals
  const subtotalStr = formatCurrency(totals.subtotal);
  text += padRight("Subtotal", WIDTH - subtotalStr.length) + subtotalStr + "\n";
  
  const taxStr = formatCurrency(totals.tax);
  text += padRight("Tax", WIDTH - taxStr.length) + taxStr + "\n";
  
  if (totals.discount > 0) {
    const discStr = "-" + formatCurrency(totals.discount);
    text += padRight("Discount", WIDTH - discStr.length) + discStr + "\n";
  }
  
  const totalStr = formatCurrency(totals.total);
  text += '\x1B\x45\x01'; // Bold
  text += padRight("Total", WIDTH - totalStr.length) + totalStr + "\n";
  text += '\x1B\x45\x00'; // Bold off
  
  text += "\n";
  text += `Payment: ${transaction.payment_method}\n`;
  if (transaction.cash_amount) {
    const cashStr = formatCurrency(transaction.cash_amount);
    text += padRight("Cash", WIDTH - cashStr.length) + cashStr + "\n";
    const changeStr = formatCurrency(transaction.change_amount);
    text += padRight("Change", WIDTH - changeStr.length) + changeStr + "\n";
  }

  if (txNote) {
    // Print the note, wrapping if necessary or let natural wrap happen
    text += "\n";
    text += `Note: ${txNote}\n`;
  }

  text += "-".repeat(WIDTH) + "\n";
  text += '\x1B\x61\x01'; // Center align
  text += "Thank You\n";
  text += "Please Come Again\n";
  
  return text;
};

let cachedDevice = null;
let cachedCharacteristic = null;

export const isBluetoothConnected = () => {
  return !!(cachedDevice && cachedDevice.gatt && cachedDevice.gatt.connected);
};

export const getCachedBluetoothDevice = () => cachedDevice;

export const getConnectedPrinterName = () => {
  if (cachedDevice && cachedDevice.gatt && cachedDevice.gatt.connected) {
    return cachedDevice.name || "Printer Bluetooth";
  }
  return null;
};

export const connectBluetoothPrinter = async () => {
  if (!navigator.bluetooth) {
    throw new Error("Web Bluetooth API tidak didukung pada browser ini.");
  }
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [
      '000018f0-0000-1000-8000-00805f9b34fb', 
      'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
      '49535343-fe7d-4ae5-8fa9-9fafd205e455'
    ]
  });
  if (!device.gatt.connected) {
    await device.gatt.connect();
  }
  const services = await device.gatt.getPrimaryServices();
  let printCharacteristic = null;
  for (const service of services) {
    const characteristics = await service.getCharacteristics();
    for (const characteristic of characteristics) {
      if (characteristic.properties.write || characteristic.properties.writeWithoutResponse) {
        printCharacteristic = characteristic;
        break;
      }
    }
    if (printCharacteristic) break;
  }
  if (!printCharacteristic) {
    throw new Error("Tidak dapat menemukan characteristic tulis pada printer Bluetooth ini.");
  }
  cachedDevice = device;
  cachedCharacteristic = printCharacteristic;
  return device;
};

export const printViaBluetooth = async (textToPrint) => {
  if (!navigator.bluetooth) {
    throw new Error("Web Bluetooth API is not supported in this browser.");
  }

  try {
    let device = cachedDevice;

    // 1. If we already have a cached device (e.g. from POS order receipt), try to reconnect to it!
    if (device && device.gatt && !device.gatt.connected) {
      try {
        await device.gatt.connect();
      } catch (reconnectErr) {
        console.warn("Failed to reconnect to cached bluetooth device, searching available devices:", reconnectErr);
        device = null;
      }
    }

    if (!device || !device.gatt || !device.gatt.connected || !cachedCharacteristic) {
      // 2. Try to get already paired / granted devices first for auto-print
      if (!device && navigator.bluetooth.getDevices) {
        try {
          const devices = await navigator.bluetooth.getDevices();
          if (devices.length > 0) {
            device = devices[0];
          }
        } catch (e) {}
      }

      // 3. If no paired device found, ask user to select one
      if (!device) {
        device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [
            '000018f0-0000-1000-8000-00805f9b34fb', 
            'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
            '49535343-fe7d-4ae5-8fa9-9fafd205e455' // Common serial
          ]
        });
      }

      if (!device.gatt.connected) {
        await device.gatt.connect();
      }

      const services = await device.gatt.getPrimaryServices();
      let printCharacteristic = null;

      for (const service of services) {
        const characteristics = await service.getCharacteristics();
        for (const characteristic of characteristics) {
          if (characteristic.properties.write || characteristic.properties.writeWithoutResponse) {
            printCharacteristic = characteristic;
            break;
          }
        }
        if (printCharacteristic) break;
      }

      if (!printCharacteristic) {
        throw new Error("Could not find a writable characteristic on this Bluetooth device.");
      }

      cachedDevice = device;
      cachedCharacteristic = printCharacteristic;
    }

    // Convert text to Esc/POS byte array
    const encoder = new TextEncoder();
    const data = encoder.encode(
      '\x1B\x40' + // Initialize
      textToPrint + 
      '\x0A\x0A\x0A\x0A\x0A' + // Feed lines
      '\x1D\x56\x00' // Cut paper
    );

    // Send chunks (BLE MTU is usually around 20-512 bytes)
    // Use 48 bytes chunk size and a small 20ms pause between chunks to prevent
    // buffer overflow / 'GATT operation in progress' error on large thermal receipts (like settlements)
    const CHUNK_SIZE = 48;
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, i + CHUNK_SIZE);
      if (cachedCharacteristic.properties.write) {
        await cachedCharacteristic.writeValue(chunk);
      } else {
        await cachedCharacteristic.writeValueWithoutResponse(chunk);
      }
      await new Promise(r => setTimeout(r, 20));
    }

    return true;
  } catch (error) {
    if (error.name === 'NotFoundError') {
        throw new Error("Operation cancelled.");
    }
    console.error("Bluetooth print error:", error);
    if (!cachedDevice?.gatt?.connected) {
      cachedCharacteristic = null;
    }
    throw error;
  }
};


export const formatSettlementReceiptEscPos = (settlementData, options = {}) => {
  const paperSize = options.paperSize || '58mm';
  // Use standard Font A by default so hardware line buffer matches WIDTH (32 on 58mm, 42 on 80mm).
  // This ensures the centered Store Profile & Address is 100% aligned with the Menu tables below.
  const compactFont = options.compactFont === true;
  const WIDTH = paperSize === '80mm' ? 42 : 32;

  // Safe padding functions that NEVER truncate characters or slice numbers
  const padRight = (str, len) => {
    str = String(str ?? "");
    return str.length >= len ? str : str + " ".repeat(len - str.length);
  };
  const padLeft = (str, len) => {
    str = String(str ?? "");
    return str.length >= len ? str : " ".repeat(len - str.length) + str;
  };
  const formatCurrency = (num) => "Rp " + Number(num || 0).toLocaleString('id-ID');

  // Word wrap helper to ensure long store names or addresses never break mid-word
  const wrapText = (str, maxLen) => {
    if (!str) return [];
    const rawLines = String(str).split(/\r?\n/);
    const finalLines = [];
    rawLines.forEach(rawLine => {
      const words = rawLine.trim().split(/\s+/).filter(Boolean);
      let currentLine = "";
      words.forEach(word => {
        if (!currentLine) {
          currentLine = word;
        } else if (currentLine.length + 1 + word.length <= maxLen) {
          currentLine += " " + word;
        } else {
          finalLines.push(currentLine);
          currentLine = word;
        }
      });
      if (currentLine) finalLines.push(currentLine);
    });
    return finalLines;
  };

  // Strict column layout so Header and Data rows are 100% aligned:
  // 58mm: colName(15) + 1 space + colQty(3) + 1 space + colPrice(12) = 32 chars
  // 80mm: colName(21) + 1 space + colQty(4) + 1 space + colPrice(15) = 42 chars
  const colName = paperSize === '80mm' ? 21 : 15;
  const colQty = paperSize === '80mm' ? 4 : 3;
  const colPrice = paperSize === '80mm' ? 15 : 12;

  const formatTableRow = (col1Text, col2Qty, col3Price) => {
    const qStr = String(col2Qty ?? "");
    const pStr = typeof col3Price === "number" ? formatCurrency(col3Price) : String(col3Price ?? "");
    const nameStr = String(col1Text ?? "");
    
    if (nameStr.length <= colName && pStr.length <= colPrice) {
      return padRight(nameStr, colName) + " " + padLeft(qStr, colQty) + " " + padLeft(pStr, colPrice) + "\n";
    } else {
      // If name is long, print name on first line and place Qty & Total strictly aligned in their columns on next line
      return nameStr + "\n" + " ".repeat(colName) + " " + padLeft(qStr, colQty) + " " + padLeft(pStr, colPrice) + "\n";
    }
  };

  let text = "";

  // Initialize printer
  text += '\x1B\x40'; // Reset / Init printer

  // Font size: Font A (standard 32 cols on 58mm) guarantees perfect alignment across header, tables, and totals
  if (compactFont) {
    text += '\x1B\x21\x01'; // ESC ! 1: Select Font B (condensed)
  } else {
    text += '\x1B\x21\x00'; // ESC ! 0: Select Font A (standard)
  }

  // Header - Centered
  text += '\x1B\x61\x01'; // Center align
  text += '\x1B\x45\x01'; // Bold
  const storeName = settlementData.storeProfile?.store_name || "NAMA KAFE & COFFEE SHOP";
  wrapText(storeName, WIDTH).forEach(line => {
    text += line + "\n";
  });
  text += '\x1B\x45\x00'; // Bold off

  if (settlementData.storeProfile?.address) {
    wrapText(settlementData.storeProfile.address, WIDTH).forEach(line => {
      text += line + "\n";
    });
  }
  if (settlementData.storeProfile?.phone) {
    text += `Telp: ${settlementData.storeProfile.phone}\n`;
  }
  text += "=".repeat(WIDTH) + "\n";

  text += '\x1B\x45\x01';
  text += "SETTLEMENT / REKONSILIASI\n";
  text += `TANGGAL : ${settlementData.formattedDate}\n`;
  text += '\x1B\x45\x00';
  text += "-".repeat(WIDTH) + "\n";

  // Section 1: CAFE/COURT by Menu Categories
  text += '\x1B\x61\x00'; // Left align
  text += '\x1B\x45\x01';
  text += (settlementData.categoryHeader || "CAFE & COURT") + "\n";
  text += '\x1B\x45\x00';

  if (settlementData.categoryGroups && settlementData.categoryGroups.length > 0) {
    settlementData.categoryGroups.forEach((group, gIdx) => {
      if (gIdx > 0) {
        text += "\n";
      }
      text += '\x1B\x45\x01';
      text += `[ ${group.category.toUpperCase()} ]\n`;
      text += '\x1B\x45\x00';
      text += padRight("Menu", colName) + " " + padLeft("Qty", colQty) + " " + padLeft("Total", colPrice) + "\n";

      group.items.forEach(item => {
        text += formatTableRow(item.name, item.qty, item.total);
      });

      // Subtotal per category
      text += "-".repeat(WIDTH) + "\n";
      text += '\x1B\x45\x01';
      text += formatTableRow(`Subtotal ${group.category}`, group.totalQty, group.subtotal);
      text += '\x1B\x45\x00';
    });
  } else if (settlementData.items && settlementData.items.length > 0) {
    text += padRight("Menu", colName) + " " + padLeft("Qty", colQty) + " " + padLeft("Total", colPrice) + "\n";
    settlementData.items.forEach(item => {
      text += formatTableRow(item.name, item.qty, item.total);
    });
  } else {
    text += formatTableRow("(Tidak ada item)", 0, 0);
  }

  text += "=".repeat(WIDTH) + "\n";
  text += '\x1B\x45\x01';
  text += formatTableRow(`TOTAL ${settlementData.categoryHeader || 'CAFE & COURT'}`, settlementData.itemsTotalQty, settlementData.itemsSubtotal);
  text += '\x1B\x45\x00';
  text += "\n";

  // Section 2: PROMO
  text += '\x1B\x45\x01';
  text += "PROMO\n";
  text += '\x1B\x45\x00';
  text += padRight("Promo", colName) + " " + padLeft("Qty", colQty) + " " + padLeft("Potongan", colPrice) + "\n";
  
  if (settlementData.promos && settlementData.promos.length > 0) {
    settlementData.promos.forEach(p => {
      text += formatTableRow(p.name, p.qty, p.discount);
    });
  } else {
    text += formatTableRow("-", 0, 0);
  }

  text += "-".repeat(WIDTH) + "\n";
  text += '\x1B\x45\x01';
  text += formatTableRow("Tot Potongan", settlementData.totalPromoQty, settlementData.totalPromoDiscount);
  text += '\x1B\x45\x00';
  text += "\n";

  // Section 3: REFUND
  text += '\x1B\x45\x01';
  text += "REFUND\n";
  text += '\x1B\x45\x00';
  text += padRight("Menu", colName) + " " + padLeft("Qty", colQty) + " " + padLeft("Total", colPrice) + "\n";
  
  if (settlementData.refunds && settlementData.refunds.length > 0) {
    settlementData.refunds.forEach(r => {
      text += formatTableRow(r.name, r.qty, r.total);
    });
  } else {
    text += formatTableRow("-", 0, 0);
  }

  text += "-".repeat(WIDTH) + "\n";
  text += '\x1B\x45\x01';
  text += formatTableRow("Tot Refund", settlementData.totalRefundQty || 0, settlementData.totalRefundAmount || 0);
  text += '\x1B\x45\x00';
  text += "\n";

  // Section 4: PAYMENT METHOD
  text += '\x1B\x45\x01';
  text += "PAYMENT METHOD\n";
  text += '\x1B\x45\x00';
  text += padRight("Metode", colName) + " " + padLeft("Qty", colQty) + " " + padLeft("Total", colPrice) + "\n";
  
  if (settlementData.paymentMethods && settlementData.paymentMethods.length > 0) {
    settlementData.paymentMethods.forEach(pm => {
      text += formatTableRow(pm.name, pm.qty, pm.total);
    });
  } else {
    text += formatTableRow("-", 0, 0);
  }

  text += "-".repeat(WIDTH) + "\n";
  text += '\x1B\x45\x01';
  text += formatTableRow("Tot Pembayaran", settlementData.totalPaymentsQty, settlementData.totalPaymentsAmount);
  text += '\x1B\x45\x00';
  text += "\n";

  // Section 5: TOTAL KESELURUHAN
  text += '\x1B\x45\x01';
  text += "TOTAL KESELURUHAN\n";
  text += '\x1B\x45\x00';
  const txTot = formatCurrency(settlementData.totalTransactions || 0);
  const discTot = formatCurrency(settlementData.totalDiscount || 0);
  const refTot = formatCurrency(settlementData.totalRefundAmount || 0);
  const grandTot = formatCurrency(settlementData.grandTotal || 0);

  const colLabel = WIDTH - 16;
  text += padRight("Total Transaksi", colLabel) + padLeft(txTot, 16) + "\n";
  text += padRight("Total Discount", colLabel) + padLeft("-" + discTot, 16) + "\n";
  if ((settlementData.totalRefundAmount || 0) > 0) {
    text += padRight("Total Refund", colLabel) + padLeft("-" + refTot, 16) + "\n";
  }
  text += "-".repeat(WIDTH) + "\n";
  text += '\x1B\x45\x01';
  text += padRight("Grand Total", colLabel) + padLeft(grandTot, 16) + "\n";
  text += '\x1B\x45\x00';
  text += "-".repeat(WIDTH) + "\n";

  // Footer
  text += '\x1B\x61\x01';
  text += '\x1B\x45\x01';
  text += "STATUS: BERHASIL / SETTLED\n";
  text += "TERIMA KASIH\n";
  text += '\x1B\x45\x00';
  text += "=".repeat(WIDTH) + "\n";
  text += "\n\n\n";

  return text;
};

export const printThermalReceiptIframe = (receiptHtml, options = {}) => {
  const paperSize = options.paperSize || '58mm';
  const fontSize = options.fontSize || 'compact'; // 'compact', 'normal', 'large'

  const widthCss = paperSize === '80mm' ? '72mm' : '48mm';
  const maxBodyWidth = paperSize === '80mm' ? '76mm' : '54mm';
  const fontSizeCss = fontSize === 'compact' ? '9.5px' : fontSize === 'normal' ? '11px' : '12px';

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Settlement / Rekonsiliasi</title>
        <style>
          @page {
            size: ${paperSize === '80mm' ? '80mm' : '58mm'} auto;
            margin: 0;
          }
          @media print {
            html, body {
              width: ${widthCss} !important;
              max-width: ${maxBodyWidth} !important;
              margin: 0 auto !important;
              padding: 1mm 0 !important;
            }
          }
          html {
            margin: 0;
            padding: 0;
          }
          body {
            margin: 0 auto;
            padding: 1.5mm;
            font-family: 'Courier New', Courier, monospace;
            font-size: ${fontSizeCss};
            line-height: 1.25;
            color: #000;
            background: #fff;
            width: ${widthCss};
            max-width: ${maxBodyWidth};
            box-sizing: border-box;
            word-break: break-word;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          table {
            width: 100% !important;
            border-collapse: collapse !important;
            table-layout: fixed !important;
            font-size: inherit !important;
          }
          th, td {
            padding: 1px 0 !important;
            vertical-align: top !important;
          }
          .text-left, .left { text-align: left !important; }
          .text-center, .center { text-align: center !important; }
          .text-right, .right { text-align: right !important; }
          .font-bold, .bold { font-weight: bold !important; }
          .font-semibold { font-weight: 600 !important; }
          .font-medium { font-weight: 500 !important; }
          .uppercase { text-transform: uppercase !important; }
          .whitespace-nowrap, .nowrap { white-space: nowrap !important; }
          .break-words { word-break: break-word !important; }
          .flex { display: flex !important; }
          .justify-between { justify-content: space-between !important; }
          .items-center { align-items: center !important; }
          .border-b { border-bottom: 1px solid #000 !important; }
          .border-t { border-top: 1px solid #000 !important; }
          .border-t-2 { border-top: 2px solid #000 !important; }
          .border-dashed { border-style: dashed !important; }
          .border-dotted { border-style: dotted !important; }
          .border-gray-900, .border-gray-400, .border-gray-300, .border-gray-100 { border-color: #000 !important; }
          .divider-double { border-top: 2px dashed #000 !important; margin: 4px 0 !important; }
          .divider-single { border-top: 1px dashed #000 !important; margin: 4px 0 !important; }
          .my-1 { margin-top: 2px !important; margin-bottom: 2px !important; }
          .my-1\\.5 { margin-top: 3px !important; margin-bottom: 3px !important; }
          .my-2 { margin-top: 4px !important; margin-bottom: 4px !important; }
          .my-3 { margin-top: 6px !important; margin-bottom: 6px !important; }
          .mt-1 { margin-top: 2px !important; }
          .mt-1\\.5 { margin-top: 3px !important; }
          .mt-2 { margin-top: 4px !important; }
          .mt-2\\.5 { margin-top: 5px !important; }
          .mt-3 { margin-top: 6px !important; }
          .mb-1 { margin-bottom: 2px !important; }
          .mb-1\\.5 { margin-bottom: 3px !important; }
          .mb-2 { margin-bottom: 4px !important; }
          .mb-3 { margin-bottom: 6px !important; }
          .pt-1 { padding-top: 2px !important; }
          .pt-1\\.5 { padding-top: 3px !important; }
          .pt-2 { padding-top: 4px !important; }
          .pt-2\\.5 { padding-top: 5px !important; }
          .py-0\\.5 { padding-top: 1px !important; padding-bottom: 1px !important; }
          .py-1 { padding-top: 2px !important; padding-bottom: 2px !important; }
          .pr-1 { padding-right: 2px !important; }
          .pr-2 { padding-right: 4px !important; }
          .space-y-1 > * + * { margin-top: 2px !important; }
          .space-y-1\\.5 > * + * { margin-top: 3px !important; }
          .text-xs { font-size: 0.9em !important; }
          .text-sm { font-size: 1.0em !important; }
          .text-base { font-size: 1.1em !important; }
          #settlement-receipt-print {
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
            width: 100% !important;
            max-width: 100% !important;
          }
        </style>
      </head>
      <body>
        ${receiptHtml}
      </body>
    </html>
  `);
  doc.close();

  iframe.contentWindow.focus();
  setTimeout(() => {
    iframe.contentWindow.print();
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 1000);
  }, 250);
};

export const formatSettlementReceiptHtml = (settlementData, options = {}) => {
  const formatCurrency = (num) => "Rp " + Number(num || 0).toLocaleString('id-ID');
  const store = settlementData.storeProfile || { store_name: "ADA PADEL & COFFEE SHOP", address: "BSD City, Tangerang" };

  let categoriesHtml = "";
  if (settlementData.categoryGroups && settlementData.categoryGroups.length > 0) {
    categoriesHtml = settlementData.categoryGroups.map((group, gIdx) => {
      const itemsRows = group.items.map(item => `
        <tr class="border-b border-gray-100">
          <td class="py-0.5 pr-1 align-top text-gray-900 break-words">${item.name}</td>
          <td class="py-0.5 text-center align-top text-gray-800">${item.qty}</td>
          <td class="py-0.5 text-right align-top whitespace-nowrap text-gray-900">${formatCurrency(item.total)}</td>
        </tr>
      `).join("");

      return `
        <div class="${gIdx > 0 ? 'mt-2 pt-1.5 border-t border-dashed border-gray-300' : ''}">
          <div class="font-bold uppercase text-black text-[11px] mb-1">[ ${group.category} ]</div>
          <table class="w-full text-left border-collapse" style="table-layout: fixed;">
            <colgroup>
              <col style="width: 48%;" />
              <col style="width: 18%;" />
              <col style="width: 34%;" />
            </colgroup>
            <thead>
              <tr class="border-b border-dashed border-gray-400">
                <th class="py-0.5 font-semibold text-left">Menu</th>
                <th class="py-0.5 font-semibold text-center">Qty</th>
                <th class="py-0.5 font-semibold text-right">Total</th>
              </tr>
            </thead>
            <tbody>${itemsRows}</tbody>
            <tfoot>
              <tr class="border-t border-dotted border-gray-400 font-semibold">
                <td class="pt-1 text-left break-words">Subtotal ${group.category}</td>
                <td class="pt-1 text-center">${group.totalQty}</td>
                <td class="pt-1 text-right whitespace-nowrap">${formatCurrency(group.subtotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      `;
    }).join("");
  } else {
    categoriesHtml = '<div class="py-2 text-center italic text-gray-500">(Tidak ada item terjual)</div>';
  }

  let promosHtml = "";
  if (settlementData.promos && settlementData.promos.length > 0) {
    promosHtml = settlementData.promos.map(p => `
      <tr class="border-b border-gray-100">
        <td class="py-0.5 pr-1 align-top break-words">${p.name}</td>
        <td class="py-0.5 text-center align-top">${p.qty}</td>
        <td class="py-0.5 text-right align-top whitespace-nowrap">${formatCurrency(p.discount)}</td>
      </tr>
    `).join("");
  } else {
    promosHtml = `
      <tr>
        <td class="py-0.5 text-gray-500">-</td>
        <td class="py-0.5 text-center text-gray-500">0</td>
        <td class="py-0.5 text-right text-gray-500">${formatCurrency(0)}</td>
      </tr>
    `;
  }

  let refundsHtml = "";
  if (settlementData.refunds && settlementData.refunds.length > 0) {
    refundsHtml = settlementData.refunds.map(r => `
      <tr class="border-b border-gray-100">
        <td class="py-0.5 pr-1 align-top break-words">${r.name}</td>
        <td class="py-0.5 text-center align-top">${r.qty}</td>
        <td class="py-0.5 text-right align-top whitespace-nowrap">${formatCurrency(r.total)}</td>
      </tr>
    `).join("");
  } else {
    refundsHtml = `
      <tr>
        <td class="py-0.5 text-gray-500">-</td>
        <td class="py-0.5 text-center text-gray-500">0</td>
        <td class="py-0.5 text-right text-gray-500">${formatCurrency(0)}</td>
      </tr>
    `;
  }

  let pmHtml = "";
  if (settlementData.paymentMethods && settlementData.paymentMethods.length > 0) {
    pmHtml = settlementData.paymentMethods.map(pm => `
      <tr class="border-b border-gray-100">
        <td class="py-0.5 pr-1 align-top break-words">${pm.name}</td>
        <td class="py-0.5 text-center align-top">${pm.qty}</td>
        <td class="py-0.5 text-right align-top whitespace-nowrap">${formatCurrency(pm.total)}</td>
      </tr>
    `).join("");
  } else {
    pmHtml = `
      <tr>
        <td class="py-0.5 text-gray-500">-</td>
        <td class="py-0.5 text-center text-gray-500">0</td>
        <td class="py-0.5 text-right text-gray-500">${formatCurrency(0)}</td>
      </tr>
    `;
  }

  return `
    <div style="font-family: 'Courier New', Courier, monospace; width: 100%;">
      <!-- Header -->
      <div class="text-center mb-2">
        <div class="font-bold text-sm uppercase tracking-wider text-black">${store.store_name || "ADA PADEL & COFFEE SHOP"}</div>
        <div class="text-xs text-gray-600 mt-0.5">${store.address || "BSD City, Tangerang"}</div>
        ${store.phone ? `<div class="text-xs text-gray-600">Telp: ${store.phone}</div>` : ''}
      </div>

      <div class="divider-double"></div>

      <!-- Title & Date -->
      <div class="text-center my-1.5">
        <div class="font-bold tracking-widest text-xs text-black">SETTLEMENT / REKONSILIASI</div>
        <div class="mt-0.5 text-xs text-gray-800">TANGGAL : ${settlementData.formattedDate}</div>
      </div>

      <div class="divider-single"></div>

      <!-- Section 1: Menu by Category -->
      <div class="my-1.5">
        <div class="font-bold uppercase text-black text-xs mb-1">${settlementData.categoryHeader || "CAFE & COURT"}</div>
        ${categoriesHtml}

        <!-- Total Section 1 -->
        <table class="w-full text-left border-collapse mt-2" style="table-layout: fixed;">
          <colgroup>
            <col style="width: 48%;" />
            <col style="width: 18%;" />
            <col style="width: 34%;" />
          </colgroup>
          <tfoot>
            <tr class="border-t-2 border-dashed border-gray-900 font-bold text-black">
              <td class="pt-1 text-left break-words">TOTAL ${settlementData.categoryHeader || "CAFE & COURT"}</td>
              <td class="pt-1 text-center">${settlementData.itemsTotalQty || 0}</td>
              <td class="pt-1 text-right whitespace-nowrap">${formatCurrency(settlementData.itemsSubtotal || 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="divider-single"></div>

      <!-- Section 2: Promo -->
      <div class="my-1.5">
        <div class="font-bold uppercase text-black text-xs mb-1">PROMO</div>
        <table class="w-full text-left border-collapse" style="table-layout: fixed;">
          <colgroup>
            <col style="width: 48%;" />
            <col style="width: 18%;" />
            <col style="width: 34%;" />
          </colgroup>
          <thead>
            <tr class="border-b border-dashed border-gray-400">
              <th class="py-0.5 font-semibold text-left">Promo</th>
              <th class="py-0.5 font-semibold text-center">Qty</th>
              <th class="py-0.5 font-semibold text-right">Potongan</th>
            </tr>
          </thead>
          <tbody>${promosHtml}</tbody>
          <tfoot>
            <tr class="border-t border-dashed border-gray-900 font-bold text-black">
              <td class="pt-1 text-left break-words">Total Potongan</td>
              <td class="pt-1 text-center">${settlementData.totalPromoQty || 0}</td>
              <td class="pt-1 text-right whitespace-nowrap">${formatCurrency(settlementData.totalPromoDiscount || 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="divider-single"></div>

      <!-- Section 3: Refund -->
      <div class="my-1.5">
        <div class="font-bold uppercase text-black text-xs mb-1">REFUND</div>
        <table class="w-full text-left border-collapse" style="table-layout: fixed;">
          <colgroup>
            <col style="width: 48%;" />
            <col style="width: 18%;" />
            <col style="width: 34%;" />
          </colgroup>
          <thead>
            <tr class="border-b border-dashed border-gray-400">
              <th class="py-0.5 font-semibold text-left">Menu</th>
              <th class="py-0.5 font-semibold text-center">Qty</th>
              <th class="py-0.5 font-semibold text-right">Total</th>
            </tr>
          </thead>
          <tbody>${refundsHtml}</tbody>
          <tfoot>
            <tr class="border-t border-dashed border-gray-900 font-bold text-black">
              <td class="pt-1 text-left break-words">Total Refund</td>
              <td class="pt-1 text-center">${settlementData.totalRefundQty || 0}</td>
              <td class="pt-1 text-right whitespace-nowrap">${formatCurrency(settlementData.totalRefundAmount || 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="divider-single"></div>

      <!-- Section 4: Payment Method -->
      <div class="my-1.5">
        <div class="font-bold uppercase text-black text-xs mb-1">PAYMENT METHOD</div>
        <table class="w-full text-left border-collapse" style="table-layout: fixed;">
          <colgroup>
            <col style="width: 48%;" />
            <col style="width: 18%;" />
            <col style="width: 34%;" />
          </colgroup>
          <thead>
            <tr class="border-b border-dashed border-gray-400">
              <th class="py-0.5 font-semibold text-left">Metode Bayar</th>
              <th class="py-0.5 font-semibold text-center">Qty</th>
              <th class="py-0.5 font-semibold text-right">Total</th>
            </tr>
          </thead>
          <tbody>${pmHtml}</tbody>
          <tfoot>
            <tr class="border-t border-dashed border-gray-900 font-bold text-black">
              <td class="pt-1 text-left break-words">Total Bayar</td>
              <td class="pt-1 text-center">${settlementData.totalPaymentsQty || 0}</td>
              <td class="pt-1 text-right whitespace-nowrap">${formatCurrency(settlementData.totalPaymentsAmount || 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="divider-single"></div>

      <!-- Section 5: Total Keseluruhan -->
      <div class="my-1.5 space-y-1">
        <div class="font-bold uppercase text-black text-xs mb-1">TOTAL KESELURUHAN</div>
        <div class="flex justify-between py-0.5">
          <span>Total Transaksi</span>
          <span class="font-medium whitespace-nowrap">${formatCurrency(settlementData.totalTransactions || 0)}</span>
        </div>
        <div class="flex justify-between py-0.5">
          <span>Total Discount</span>
          <span class="font-medium whitespace-nowrap">-${formatCurrency(settlementData.totalDiscount || 0)}</span>
        </div>
        ${(settlementData.totalRefundAmount || 0) > 0 ? `
        <div class="flex justify-between py-0.5 text-red-600">
          <span>Total Refund</span>
          <span class="font-medium whitespace-nowrap">-${formatCurrency(settlementData.totalRefundAmount || 0)}</span>
        </div>` : ''}
        <div class="border-t border-dashed border-gray-900 my-1 pt-1 flex justify-between font-bold text-xs text-black">
          <span>Grand Total</span>
          <span class="whitespace-nowrap">${formatCurrency(settlementData.grandTotal || 0)}</span>
        </div>
      </div>

      <div class="divider-single"></div>

      <!-- Footer -->
      <div class="text-center my-1.5 space-y-0.5">
        <div class="font-bold uppercase tracking-wider text-black text-xs">STATUS: BERHASIL / SETTLED</div>
        <div class="text-gray-700 tracking-wide text-[11px]">TERIMA KASIH</div>
      </div>

      <div class="divider-double"></div>
    </div>
  `;
};

export const printSettlementReceipt = async (settlementData, options = {}) => {
  const paperSize = options.paperSize || "58mm";
  const compactFont = options.compactFont === true;

  let escPosText = "";
  try {
    escPosText = formatSettlementReceiptEscPos(settlementData, { paperSize, compactFont });
  } catch (fmtErr) {
    console.error("Error formatting settlement ESC/POS:", fmtErr);
  }

  // 1. If Bluetooth is actively connected, print directly via Bluetooth
  const hasActiveBt = isBluetoothConnected();
  if (hasActiveBt && escPosText) {
    try {
      await printViaBluetooth(escPosText);
      return { success: true, method: "bluetooth", deviceName: getConnectedPrinterName() };
    } catch (btErr) {
      console.warn("Active Bluetooth print failed, falling back to browser print:", btErr);
      const html = formatSettlementReceiptHtml(settlementData, { paperSize, fontSize: options.fontSize || "compact" });
      printThermalReceiptIframe(html, { paperSize, fontSize: options.fontSize || "compact" });
      return { success: true, method: "browser", fallbackReason: btErr.message };
    }
  }

  // 2. If Bluetooth is supported in browser and we have ESC/POS text
  if (typeof navigator !== "undefined" && navigator.bluetooth && escPosText) {
    try {
      await printViaBluetooth(escPosText);
      return { success: true, method: "bluetooth", deviceName: getConnectedPrinterName() };
    } catch (btErr) {
      console.warn("Bluetooth print failed or cancelled, falling back to browser print:", btErr);
      const html = formatSettlementReceiptHtml(settlementData, { paperSize, fontSize: options.fontSize || "compact" });
      printThermalReceiptIframe(html, { paperSize, fontSize: options.fontSize || "compact" });
      return { success: true, method: "browser", fallbackReason: btErr.message };
    }
  }

  // 3. Browser Print Dialog Fallback
  const html = formatSettlementReceiptHtml(settlementData, { paperSize, fontSize: options.fontSize || "compact" });
  printThermalReceiptIframe(html, { paperSize, fontSize: options.fontSize || "compact" });
  return { success: true, method: "browser" };
};

export const getItemSignature = (item) => {
  const menuId = item.menu_id || item.menu_name;
  let drink = item.drink_type || "";
  let sugar = item.sugar_level || "";
  let note = (item.note || "").trim().toLowerCase();
  let addons = "";
  if (item.addons && Array.isArray(item.addons)) {
    addons = item.addons.map(a => `${a.addon_id || a.menu_id || a.name}`).sort().join(",");
  }
  return `${menuId}__${drink}__${sugar}__${note}__${addons}`;
};

export const formatCaptainOrderText = (storeProfile, orderInfo, items, options = {}) => {
  const paperSize = options.paperSize || "58mm";
  const WIDTH = paperSize === "80mm" ? 42 : 32;

  let text = "";
  // Reset
  text += '\x1B\x40';
  text += '\x1B\x21\x00'; // Font A standard

  // Header - Centered
  text += '\x1B\x61\x01';
  text += '\x1B\x45\x01'; // Bold ON
  text += (storeProfile?.store_name || "CAFE & RESTO") + "\n";
  text += "*** CAPTAIN ORDER ***\n";
  if (orderInfo.isAdditional) {
    text += ">>> ORDER TAMBAHAN <<<\n";
  }
  text += '\x1B\x45\x00'; // Bold OFF
  text += "=".repeat(WIDTH) + "\n";

  // Order Details - Left align
  text += '\x1B\x61\x00';
  text += `Tgl : ${orderInfo.date || new Date().toLocaleString("id-ID")}\n`;
  text += `Meja: ${orderInfo.table_no || "-"}\n`;
  let cust = orderInfo.customer_name || "Guest";
  text += `Cust: ${cust}\n`;
  if (orderInfo.bill_id) {
    text += `Bill: #${orderInfo.bill_id}\n`;
  }
  if (orderInfo.invoice_no) {
    text += `Inv : #${orderInfo.invoice_no}\n`;
  }
  if (orderInfo.transaction_note) {
    text += `Note: ${orderInfo.transaction_note}\n`;
  }
  text += "-".repeat(WIDTH) + "\n";

  // Items List
  let totalQty = 0;
  items.forEach((item) => {
    const q = Number(item.qty || 1);
    totalQty += q;

    let name = item.menu_name || "";
    let note = item.note || "";
    const noteMatch = name.match(/\(Note: (.*?)\)$/);
    if (noteMatch) {
      note = noteMatch[1] || note;
      name = name.replace(/\s*\(Note: .*?\)$/, "");
    }
    let drinkType = item.drink_type || "";
    let sugarLevel = item.sugar_level || "";
    const drinkMatch = name.match(/\[(Hot|Ice)\]/);
    if (drinkMatch) {
      drinkType = drinkMatch[1] || drinkType;
      name = name.replace(/\s*\[(?:Hot|Ice)\]/, "");
    }
    const sugarMatch = name.match(/\[(.*?) Sugar\]/);
    if (sugarMatch) {
      sugarLevel = sugarMatch[1] || sugarLevel;
      name = name.replace(/\s*\[.*? Sugar\]/, "");
    }

    // Bold Item Header with prominent quantity
    text += '\x1B\x45\x01'; // Bold
    text += `[ ${q}x ] ${name}\n`.substring(0, WIDTH + 1);
    text += '\x1B\x45\x00'; // Bold off

    if (drinkType || sugarLevel) {
      const opts = [];
      if (drinkType) opts.push(drinkType);
      if (sugarLevel) opts.push(`${sugarLevel} Sugar`);
      text += `      - ${opts.join(", ")}\n`.substring(0, WIDTH + 1);
    }

    if (item.addons && Array.isArray(item.addons) && item.addons.length > 0) {
      item.addons.forEach((a) => {
        text += `      + Addon: ${a.name}\n`.substring(0, WIDTH + 1);
      });
    }

    if (note) {
      text += `      * NOTE: ${note}\n`.substring(0, WIDTH + 1);
    }
  });

  text += "-".repeat(WIDTH) + "\n";
  text += '\x1B\x45\x01';
  if (orderInfo.isAdditional) {
    text += `TOTAL TAMBAHAN: ${totalQty} items\n`;
  } else {
    text += `TOTAL ITEM    : ${totalQty} items\n`;
  }
  text += '\x1B\x45\x00';
  text += "=".repeat(WIDTH) + "\n";

  // Footer - Centered
  text += '\x1B\x61\x01';
  text += "[ KITCHEN / BAR TICKET ]\n";
  text += "\n\n\n";

  return text;
};

export const formatCaptainOrderHtml = (storeProfile, orderInfo, items) => {
  const store = storeProfile || { store_name: "CAFE & RESTO" };
  const totalQty = items.reduce((sum, i) => sum + Number(i.qty || 1), 0);

  const itemsHtml = items.map((item) => {
    let name = item.menu_name || "";
    let note = item.note || "";
    const noteMatch = name.match(/\(Note: (.*?)\)$/);
    if (noteMatch) {
      note = noteMatch[1] || note;
      name = name.replace(/\s*\(Note: .*?\)$/, "").trim();
    }
    let drinkType = item.drink_type || "";
    let sugarLevel = item.sugar_level || "";
    const drinkMatch = name.match(/\[(Hot|Ice)\]/);
    if (drinkMatch) {
      drinkType = drinkMatch[1] || drinkType;
      name = name.replace(/\s*\[(?:Hot|Ice)\]/, "").trim();
    }
    const sugarMatch = name.match(/\[(.*?) Sugar\]/);
    if (sugarMatch) {
      sugarLevel = sugarMatch[1] || sugarLevel;
      name = name.replace(/\s*\[.*? Sugar\]/, "").trim();
    }

    const optionsStr = [drinkType, sugarLevel ? `${sugarLevel} Sugar` : ""].filter(Boolean).join(", ");
    const addonsList = item.addons && Array.isArray(item.addons) ? item.addons.map(a => a.name).join(", ") : "";

    return `
      <div class="py-1.5 border-b border-dashed border-gray-300">
        <div class="font-bold text-sm text-black flex items-start">
          <span class="inline-block bg-black text-white px-1.5 py-0.5 rounded text-xs mr-1.5 shrink-0">${item.qty}x</span>
          <span class="break-words">${name}</span>
        </div>
        ${optionsStr ? `<div class="text-xs text-gray-700 pl-7 mt-0.5">- ${optionsStr}</div>` : ""}
        ${addonsList ? `<div class="text-xs text-gray-700 pl-7 mt-0.5">+ Addon: ${addonsList}</div>` : ""}
        ${note ? `<div class="text-xs font-semibold text-gray-900 pl-7 mt-0.5">* NOTE: ${note}</div>` : ""}
      </div>
    `;
  }).join("");

  return `
    <div style="font-family: 'Courier New', Courier, monospace; width: 100%;">
      <div class="text-center mb-2">
        <div class="font-bold text-sm uppercase tracking-wider text-black">${store.store_name}</div>
        <div class="font-bold text-xs uppercase tracking-widest mt-0.5 text-black">*** CAPTAIN ORDER ***</div>
        ${orderInfo.isAdditional ? '<div class="font-black text-xs text-black mt-0.5">>>> ORDER TAMBAHAN <<<</div>' : ''}
      </div>

      <div class="divider-double"></div>

      <div class="text-xs space-y-0.5 my-1.5 text-black">
        <div><span class="font-bold">Tgl :</span> ${orderInfo.date || new Date().toLocaleString("id-ID")}</div>
        <div><span class="font-bold">Meja:</span> ${orderInfo.table_no || "-"}</div>
        <div><span class="font-bold">Cust:</span> ${orderInfo.customer_name || "Guest"}</div>
        ${orderInfo.bill_id ? `<div><span class="font-bold">Bill:</span> #${orderInfo.bill_id}</div>` : ''}
        ${orderInfo.invoice_no ? `<div><span class="font-bold">Inv :</span> #${orderInfo.invoice_no}</div>` : ''}
        ${orderInfo.transaction_note ? `<div><span class="font-bold">Note:</span> ${orderInfo.transaction_note}</div>` : ''}
      </div>

      <div class="divider-single"></div>

      <div class="my-2">
        ${itemsHtml}
      </div>

      <div class="divider-single"></div>

      <div class="flex justify-between items-center font-bold text-xs text-black my-1.5">
        <span>${orderInfo.isAdditional ? "TOTAL TAMBAHAN" : "TOTAL ITEM"}</span>
        <span>${totalQty} items</span>
      </div>

      <div class="divider-double"></div>

      <div class="text-center text-xs text-black font-bold my-1">
        [ KITCHEN / BAR TICKET ]
      </div>
    </div>
  `;
};

export const formatReceiptHtml = (storeProfile, transaction, cart, totals) => {
  const store = storeProfile || { store_name: "CAFE & RESTO", address: "BSD City, Tangerang" };
  const formatCurrency = (num) => "Rp " + Number(num || 0).toLocaleString('id-ID');

  let custName = transaction.customer_name || "Guest";
  let txNote = transaction.transaction_note || "";
  if (custName && !txNote) {
    const txNoteMatch = custName.match(/ - Note: ([\s\S]*)$/);
    if (txNoteMatch) {
      txNote = txNoteMatch[1];
      custName = custName.replace(/\s*- Note: [\s\S]*$/, "");
    }
  }

  const itemsHtml = cart.map((item) => {
    let name = item.menu_name || "";
    let note = item.note || "";
    const noteMatch = name.match(/\(Note: (.*?)\)$/);
    if (noteMatch) {
      note = noteMatch[1] || note;
      name = name.replace(/\s*\(Note: .*?\)$/, "").trim();
    }
    let drinkType = item.drink_type || "";
    let sugarLevel = item.sugar_level || "";
    const drinkMatch = name.match(/\[(Hot|Ice)\]/);
    if (drinkMatch) {
      drinkType = drinkMatch[1] || drinkType;
      name = name.replace(/\s*\[(?:Hot|Ice)\]/, "").trim();
    }
    const sugarMatch = name.match(/\[(.*?) Sugar\]/);
    if (sugarMatch) {
      sugarLevel = sugarMatch[1] || sugarLevel;
      name = name.replace(/\s*\[.*? Sugar\]/, "").trim();
    }

    const optionsStr = [drinkType, sugarLevel ? `${sugarLevel} Sugar` : ""].filter(Boolean).join(", ");
    const addonsList = item.addons && Array.isArray(item.addons) ? item.addons.map(a => a.name).join(", ") : "";

    return `
      <div class="py-1 border-b border-gray-100">
        <div class="font-bold text-xs text-black break-words">${name}</div>
        ${optionsStr ? `<div class="text-[10px] text-gray-600 pl-2">- ${optionsStr}</div>` : ""}
        ${addonsList ? `<div class="text-[10px] text-gray-600 pl-2">+ Addon: ${addonsList}</div>` : ""}
        ${note ? `<div class="text-[10px] text-gray-700 pl-2">* Note: ${note}</div>` : ""}
        <div class="flex justify-between items-center text-xs mt-0.5">
          <span>${item.qty}x ${formatCurrency(item.price)} ${item.is_auto_free ? '(FREE)' : ''}</span>
          <span class="font-medium">${formatCurrency(item.subtotal)}</span>
        </div>
      </div>
    `;
  }).join("");

  return `
    <div style="font-family: 'Courier New', Courier, monospace; width: 100%;">
      <!-- Header -->
      <div class="text-center mb-2">
        <div class="font-bold text-sm uppercase text-black">${store.store_name}</div>
        ${store.address ? `<div class="text-xs text-gray-600 mt-0.5">${store.address}</div>` : ''}
        ${store.phone ? `<div class="text-xs text-gray-600">Telp: ${store.phone}</div>` : ''}
      </div>

      <div class="divider-single"></div>

      <!-- Info -->
      <div class="text-xs space-y-0.5 my-1 text-black">
        <div><span class="font-bold">Inv :</span> #${transaction.invoice_no}</div>
        <div><span class="font-bold">Date:</span> ${transaction.date}</div>
        <div><span class="font-bold">Cust:</span> ${custName}</div>
        <div><span class="font-bold">Type:</span> ${transaction.table_no}</div>
      </div>

      <div class="divider-single"></div>

      <!-- Items -->
      <div class="my-1">
        ${itemsHtml}
      </div>

      <div class="divider-single"></div>

      <!-- Totals -->
      <div class="text-xs space-y-0.5 my-1 text-black">
        <div class="flex justify-between">
          <span>Subtotal</span>
          <span>${formatCurrency(totals.subtotal)}</span>
        </div>
        <div class="flex justify-between">
          <span>Tax</span>
          <span>${formatCurrency(totals.tax)}</span>
        </div>
        ${totals.discount > 0 ? `
        <div class="flex justify-between text-green-700">
          <span>Discount</span>
          <span>-${formatCurrency(totals.discount)}</span>
        </div>` : ''}
        <div class="border-t border-dashed border-gray-800 pt-1 flex justify-between font-bold text-sm text-black">
          <span>Total</span>
          <span>${formatCurrency(totals.total)}</span>
        </div>
      </div>

      <div class="divider-single"></div>

      <div class="text-xs space-y-0.5 my-1 text-black">
        <div><span class="font-bold">Payment:</span> ${transaction.payment_method}</div>
        ${transaction.cash_amount ? `
        <div class="flex justify-between">
          <span>Cash</span>
          <span>${formatCurrency(transaction.cash_amount)}</span>
        </div>
        <div class="flex justify-between">
          <span>Change</span>
          <span>${formatCurrency(transaction.change_amount)}</span>
        </div>` : ''}
        ${txNote ? `<div class="mt-1"><span class="font-bold">Note:</span> ${txNote}</div>` : ''}
      </div>

      <div class="divider-single"></div>

      <div class="text-center my-2 space-y-0.5 text-xs text-black">
        <div class="font-semibold">Thank You</div>
        <div class="text-[11px] text-gray-700">Please Come Again</div>
      </div>
    </div>
  `;
};

let isGlobalPrintingBusy = false;

export const isPrinterBusy = () => isGlobalPrintingBusy;

export const printCaptainOrder = async (storeProfile, orderInfo, items, options = {}) => {
  if (isGlobalPrintingBusy) {
    console.warn("Printer is busy. Ignoring duplicate captain order print request.");
    return { success: false, busy: true };
  }
  isGlobalPrintingBusy = true;
  try {
    const paperSize = options.paperSize || "58mm";

    let escPosText = "";
    try {
      escPosText = formatCaptainOrderText(storeProfile, orderInfo, items, { paperSize });
    } catch (err) {
      console.error("Error formatting captain order ESC/POS:", err);
    }

    // 1. Try Bluetooth if connected
    const hasActiveBt = isBluetoothConnected();
    if (hasActiveBt && escPosText) {
      try {
        await printViaBluetooth(escPosText);
        return { success: true, method: "bluetooth" };
      } catch (btErr) {
        console.warn("Active Bluetooth print failed, falling back to browser print:", btErr);
        const html = formatCaptainOrderHtml(storeProfile, orderInfo, items);
        printThermalReceiptIframe(html, { paperSize });
        return { success: true, method: "browser", fallbackReason: btErr.message };
      }
    }

    // 2. Try Bluetooth device if browser supports
    if (typeof navigator !== "undefined" && navigator.bluetooth && escPosText) {
      try {
        await printViaBluetooth(escPosText);
        return { success: true, method: "bluetooth" };
      } catch (btErr) {
        console.warn("Bluetooth print failed or cancelled, falling back to browser print:", btErr);
        const html = formatCaptainOrderHtml(storeProfile, orderInfo, items);
        printThermalReceiptIframe(html, { paperSize });
        return { success: true, method: "browser", fallbackReason: btErr.message };
      }
    }

    // 3. Fallback to browser iframe print
    const html = formatCaptainOrderHtml(storeProfile, orderInfo, items);
    printThermalReceiptIframe(html, { paperSize });
    return { success: true, method: "browser" };
  } finally {
    // Add small buffer time before releasing lock to ensure hardware finishes carriage return
    setTimeout(() => {
      isGlobalPrintingBusy = false;
    }, 500);
  }
};

export const printCustomerReceipt = async (storeProfile, transaction, cart, totals, options = {}) => {
  if (isGlobalPrintingBusy) {
    console.warn("Printer is busy. Ignoring duplicate receipt print request.");
    return { success: false, busy: true };
  }
  isGlobalPrintingBusy = true;
  try {
    const paperSize = options.paperSize || "58mm";

    let escPosText = "";
    try {
      escPosText = formatReceiptText(storeProfile, transaction, cart, totals);
    } catch (err) {
      console.error("Error formatting receipt ESC/POS:", err);
    }

    // 1. Try Bluetooth if active
    const hasActiveBt = isBluetoothConnected();
    if (hasActiveBt && escPosText) {
      try {
        await printViaBluetooth(escPosText);
        return { success: true, method: "bluetooth" };
      } catch (btErr) {
        console.warn("Active Bluetooth print failed, falling back to browser print:", btErr);
        const html = formatReceiptHtml(storeProfile, transaction, cart, totals);
        printThermalReceiptIframe(html, { paperSize });
        return { success: true, method: "browser", fallbackReason: btErr.message };
      }
    }

    // 2. Try Bluetooth if available
    if (typeof navigator !== "undefined" && navigator.bluetooth && escPosText) {
      try {
        await printViaBluetooth(escPosText);
        return { success: true, method: "bluetooth" };
      } catch (btErr) {
        console.warn("Bluetooth print failed or cancelled, falling back to browser print:", btErr);
        const html = formatReceiptHtml(storeProfile, transaction, cart, totals);
        printThermalReceiptIframe(html, { paperSize });
        return { success: true, method: "browser", fallbackReason: btErr.message };
      }
    }

    // 3. Fallback to browser iframe print
    const html = formatReceiptHtml(storeProfile, transaction, cart, totals);
    printThermalReceiptIframe(html, { paperSize });
    return { success: true, method: "browser" };
  } finally {
    setTimeout(() => {
      isGlobalPrintingBusy = false;
    }, 500);
  }
};

