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
    const CHUNK_SIZE = 100;
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, i + CHUNK_SIZE);
      if (cachedCharacteristic.properties.write) {
         await cachedCharacteristic.writeValue(chunk);
      } else {
         await cachedCharacteristic.writeValueWithoutResponse(chunk);
      }
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
  const compactFont = options.compactFont !== false;
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

  let text = "";

  // Initialize printer
  text += '\x1B\x40'; // Reset / Init printer

  // Font size: If compactFont, select Font B (smaller font) to fit 58mm perfectly without cutoffs
  if (compactFont) {
    text += '\x1B\x21\x01'; // ESC ! 1: Select Font B (condensed)
  } else {
    text += '\x1B\x21\x00'; // ESC ! 0: Select Font A (standard)
  }

  // Header - Centered
  text += '\x1B\x61\x01';
  text += '\x1B\x45\x01'; // Bold
  text += (settlementData.storeProfile?.store_name || "NAMA KAFE & COFFEE SHOP") + "\n";
  text += '\x1B\x45\x00'; // Bold off
  if (settlementData.storeProfile?.address) {
    text += settlementData.storeProfile.address + "\n";
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
  text += padRight("Menu", 15) + " " + padLeft("Qty", 3) + " " + padLeft("Total", 12) + "\n";

      group.items.forEach(item => {
        let name = item.name || "";
        const qtyStr = String(item.qty || 0);
        const priceStr = formatCurrency(item.total);
        if (name.length <= 14 && priceStr.length <= 13) {
          text += padRight(name, 14) + " " + padLeft(qtyStr, 3) + " " + padLeft(priceStr, 13) + "\n";
        } else {
          text += name + "\n";
          text += "   " + padRight(qtyStr + "x", 6) + padLeft(priceStr, WIDTH - 9) + "\n";
        }
      });

      // Subtotal per category
      text += "-".repeat(WIDTH) + "\n";
      text += '\x1B\x45\x01';
      const subCatLabel = `Subtotal ${group.category}`;
      const subCatQty = String(group.totalQty || 0);
      const subCatTotal = formatCurrency(group.subtotal || 0);
      if (subCatLabel.length <= 14 && subCatTotal.length <= 13) {
        text += padRight(subCatLabel, 14) + " " + padLeft(subCatQty, 3) + " " + padLeft(subCatTotal, 13) + "\n";
      } else {
        text += subCatLabel + "\n";
        text += "   " + padRight("Tot: " + subCatQty + "x", 10) + padLeft(subCatTotal, WIDTH - 13) + "\n";
      }
      text += '\x1B\x45\x00';
    });
  } else if (settlementData.items && settlementData.items.length > 0) {
    text += padRight("Menu", 15) + " " + padLeft("Qty", 3) + " " + padLeft("Total", 12) + "\n";
    settlementData.items.forEach(item => {
      let name = item.name || "";
      const qtyStr = String(item.qty || 0);
      const priceStr = formatCurrency(item.total);
      if (name.length <= 14 && priceStr.length <= 13) {
        text += padRight(name, 14) + " " + padLeft(qtyStr, 3) + " " + padLeft(priceStr, 13) + "\n";
      } else {
        text += name + "\n";
        text += "   " + padRight(qtyStr + "x", 6) + padLeft(priceStr, WIDTH - 9) + "\n";
      }
    });
  } else {
    text += padRight("(Tidak ada item)", 15) + "   0 " + padLeft(formatCurrency(0), 12) + "\n";
  }

  text += "=".repeat(WIDTH) + "\n";
  text += '\x1B\x45\x01';
  const subLabel = `TOTAL ${settlementData.categoryHeader || 'CAFE & COURT'}`;
  const subQty = String(settlementData.itemsTotalQty || 0);
  const subTotal = formatCurrency(settlementData.itemsSubtotal || 0);
  if (subLabel.length <= 14 && subTotal.length <= 13) {
    text += padRight(subLabel, 14) + " " + padLeft(subQty, 3) + " " + padLeft(subTotal, 13) + "\n";
  } else {
    text += subLabel + "\n";
    text += "   " + padRight("Tot: " + subQty + "x", 10) + padLeft(subTotal, WIDTH - 13) + "\n";
  }
  text += '\x1B\x45\x00';
  text += "\n";

  // Section 2: PROMO
  text += '\x1B\x45\x01';
  text += "PROMO\n";
  text += '\x1B\x45\x00';
  text += padRight("Promo", 15) + " " + padLeft("Qty", 3) + " " + padLeft("Potongan", 12) + "\n";
  
  if (settlementData.promos && settlementData.promos.length > 0) {
    settlementData.promos.forEach(p => {
      let pName = p.name || "";
      const pQty = String(p.qty || 0);
      const pDisc = formatCurrency(p.discount || 0);
      if (pName.length <= 14 && pDisc.length <= 13) {
        text += padRight(pName, 14) + " " + padLeft(pQty, 3) + " " + padLeft(pDisc, 13) + "\n";
      } else {
        text += pName + "\n";
        text += "   " + padRight(pQty + "x", 6) + padLeft(pDisc, WIDTH - 9) + "\n";
      }
    });
  } else {
    text += "   " + padRight(pQty + "x", 6) + padLeft(pDisc, WIDTH - 9) + "\n";
  }

  text += "-".repeat(WIDTH) + "\n";
  text += '\x1B\x45\x01';
  const totPromoQty = String(settlementData.totalPromoQty || 0);
  const totPromoDisc = formatCurrency(settlementData.totalPromoDiscount || 0);
   text += padRight("Tot Potongan", 14) + " " + padLeft(totPromoQty, 3) + " " + padLeft(totPromoDisc, 13) + "\n";
  text += '\x1B\x45\x00';
  text += "\n";

  // Section 3: PAYMENT METHOD
  text += '\x1B\x45\x01';
  text += "PAYMENT METHOD\n";
  text += '\x1B\x45\x00';
  text += padRight("Metode", 15) + " " + padLeft("Qty", 3) + " " + padLeft("Total", 12) + "\n";
  
  if (settlementData.paymentMethods && settlementData.paymentMethods.length > 0) {
    settlementData.paymentMethods.forEach(pm => {
      let pmName = pm.name || "";
      const pmQty = String(pm.qty || 0);
      const pmTot = formatCurrency(pm.total || 0);
      if (pmName.length <= 14 && pmTot.length <= 13) {
        text += padRight(pmName, 14) + " " + padLeft(pmQty, 3) + " " + padLeft(pmTot, 13) + "\n";
      } else {
        text += pmName + "\n";
        text += "   " + padRight(pmQty + "x", 6) + padLeft(pmTot, WIDTH - 9) + "\n";
      }
    });
  } else {
    text += padRight("-", 15) + "   0 " + padLeft(formatCurrency(0), 12) + "\n";
  }

  text += "-".repeat(WIDTH) + "\n";
  text += '\x1B\x45\x01';
  const totPayQty = String(settlementData.totalPaymentsQty || 0);
  const totPayAmt = formatCurrency(settlementData.totalPaymentsAmount || 0);
  text += padRight("Tot Pembayaran", 14) + " " + padLeft(totPayQty, 3) + " " + padLeft(totPayAmt, 13) + "\n";
  text += '\x1B\x45\x00';
  text += "\n";

  // Section 4: TOTAL KESELURUHAN
  text += '\x1B\x45\x01';
  text += "TOTAL KESELURUHAN\n";
  text += '\x1B\x45\x00';
  const txTot = formatCurrency(settlementData.totalTransactions || 0);
  const discTot = formatCurrency(settlementData.totalDiscount || 0);
  const grandTot = formatCurrency(settlementData.grandTotal || 0);

  text += padRight("Total Transaksi", 15) + " " + padLeft(txTot, 16) + "\n";
  text += padRight("Total Discount", 15) + " " + padLeft("-" + discTot, 16) + "\n";
  text += "-".repeat(WIDTH) + "\n";
  text += '\x1B\x45\x01';
  text += padRight("Grand Total", 15) + " " + padLeft(grandTot, 16) + "\n";
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

      <!-- Section 3: Payment Method -->
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

      <!-- Section 4: Total Keseluruhan -->
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
  const compactFont = options.compactFont !== false;
  const escPosText = formatSettlementReceiptEscPos(settlementData, { paperSize, compactFont });

  // 1. Check if Bluetooth is available / connected, same as POS order receipts
  if (typeof navigator !== "undefined" && navigator.bluetooth) {
    try {
      await printViaBluetooth(escPosText);
      return { success: true, method: "bluetooth" };
    } catch (btErr) {
      console.warn("Bluetooth print failed or cancelled, falling back to browser print:", btErr);
      // Fallback to browser print dialog
      const html = formatSettlementReceiptHtml(settlementData, { paperSize, fontSize: options.fontSize || "compact" });
      printThermalReceiptIframe(html, { paperSize, fontSize: options.fontSize || "compact" });
      return { success: true, method: "browser", fallbackReason: btErr.message };
    }
  } else {
    // Bluetooth not supported on this browser/environment, use browser print
    const html = formatSettlementReceiptHtml(settlementData, { paperSize, fontSize: options.fontSize || "compact" });
    printThermalReceiptIframe(html, { paperSize, fontSize: options.fontSize || "compact" });
    return { success: true, method: "browser" };
  }
};
