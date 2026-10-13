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
    if (!cachedDevice || !cachedDevice.gatt.connected || !cachedCharacteristic) {
      let device;

      // Try to get already paired devices first for auto-print
      if (navigator.bluetooth.getDevices) {
        const devices = await navigator.bluetooth.getDevices();
        if (devices.length > 0) {
          device = devices[0];
        }
      }

      // If no paired device found, ask user to select one
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
    // On error, clear cache
    cachedDevice = null;
    cachedCharacteristic = null;
    throw error;
  }
};


export const formatSettlementReceiptEscPos = (settlementData) => {
  const WIDTH = 32;
  const padRight = (str, len) => (str + " ".repeat(Math.max(0, len))).substring(0, len);
  const padLeft = (str, len) => (" ".repeat(Math.max(0, len)) + str).slice(-len);
  const formatCurrency = (num) => "Rp " + Number(num || 0).toLocaleString('id-ID');

  let text = "";

  // Header - Centered
  text += '\x1B\x61\x01';
  text += '\x1B\x45\x01'; // Bold
  text += (settlementData.storeProfile?.store_name || "NAMA KAFE & COFFEE SHOP") + "\n";
  text += '\x1B\x45\x00'; // Bold off
  if (settlementData.storeProfile?.address) {
    text += settlementData.storeProfile.address + "\n";
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
  text += padRight("Menu", 16) + padLeft("Qty", 4) + padLeft("Total", 12) + "\n";

      group.items.forEach(item => {
        let name = item.name || "";
        const qtyStr = String(item.qty || 0);
        const priceStr = formatCurrency(item.total);
        if (name.length > 15) {
          text += name + "\n";
          text += padRight("", 16) + padLeft(qtyStr, 4) + padLeft(priceStr, 12) + "\n";
        } else {
          text += padRight(name, 16) + padLeft(qtyStr, 4) + padLeft(priceStr, 12) + "\n";
        }
      });

      // Subtotal per category
      text += "-".repeat(WIDTH) + "\n";
      text += '\x1B\x45\x01';
      const subCatLabel = `Subtotal ${group.category}`;
      const subCatQty = String(group.totalQty || 0);
      const subCatTotal = formatCurrency(group.subtotal || 0);
      if (subCatLabel.length > 15) {
        text += subCatLabel + "\n";
        text += padRight("", 16) + padLeft(subCatQty, 4) + padLeft(subCatTotal, 12) + "\n";
      } else {
        text += padRight(subCatLabel, 16) + padLeft(subCatQty, 4) + padLeft(subCatTotal, 12) + "\n";
      }
      text += '\x1B\x45\x00';
    });
  } else if (settlementData.items && settlementData.items.length > 0) {
    text += padRight("Menu", 16) + padLeft("Qty", 4) + padLeft("Total", 12) + "\n";
    settlementData.items.forEach(item => {
      let name = item.name || "";
      const qtyStr = String(item.qty || 0);
      const priceStr = formatCurrency(item.total);
      if (name.length > 15) {
        text += name + "\n";
        text += padRight("", 16) + padLeft(qtyStr, 4) + padLeft(priceStr, 12) + "\n";
      } else {
        text += padRight(name, 16) + padLeft(qtyStr, 4) + padLeft(priceStr, 12) + "\n";
      }
    });
  } else {
    text += padRight("(Tidak ada item)", 16) + padLeft("0", 4) + padLeft(formatCurrency(0), 12) + "\n";
  }

  text += "=".repeat(WIDTH) + "\n";
  text += '\x1B\x45\x01';
  const subLabel = `TOTAL ${settlementData.categoryHeader || 'CAFE & COURT'}`;
  const subQty = String(settlementData.itemsTotalQty || 0);
  const subTotal = formatCurrency(settlementData.itemsSubtotal || 0);
  if (subLabel.length > 15) {
    text += subLabel + "\n";
    text += padRight("", 16) + padLeft(subQty, 4) + padLeft(subTotal, 12) + "\n";
  } else {
    text += padRight(subLabel, 16) + padLeft(subQty, 4) + padLeft(subTotal, 12) + "\n";
  }
  text += '\x1B\x45\x00';
  text += "\n";

  // Section 2: PROMO
  text += '\x1B\x45\x01';
  text += "PROMO\n";
  text += '\x1B\x45\x00';
  text += padRight("Promo", 15) + padLeft("Qty", 4) + padLeft("Total Pot", 13) + "\n";
  
  if (settlementData.promos && settlementData.promos.length > 0) {
    settlementData.promos.forEach(p => {
      let pName = p.name || "";
      const pQty = String(p.qty || 0);
      const pDisc = formatCurrency(p.discount || 0);
      if (pName.length > 14) {
        text += pName + "\n";
        text += padRight("", 15) + padLeft(pQty, 4) + padLeft(pDisc, 13) + "\n";
      } else {
        text += padRight(pName, 15) + padLeft(pQty, 4) + padLeft(pDisc, 13) + "\n";
      }
    });
  } else {
    text += padRight("-", 15) + padLeft("0", 4) + padLeft(formatCurrency(0), 13) + "\n";
  }

  text += "-".repeat(WIDTH) + "\n";
  text += '\x1B\x45\x01';
  const totPromoQty = String(settlementData.totalPromoQty || 0);
  const totPromoDisc = formatCurrency(settlementData.totalPromoDiscount || 0);
  text += "Total Potongan Promo\n";
  text += padRight("", 15) + padLeft(totPromoQty, 4) + padLeft(totPromoDisc, 13) + "\n";
  text += '\x1B\x45\x00';
  text += "\n";

  // Section 3: PAYMENT METHOD
  text += '\x1B\x45\x01';
  text += "PAYMENT METHOD\n";
  text += '\x1B\x45\x00';
  text += padRight("Metode Pembayaran", 15) + padLeft("Qty", 4) + padLeft("Total", 13) + "\n";
  
  if (settlementData.paymentMethods && settlementData.paymentMethods.length > 0) {
    settlementData.paymentMethods.forEach(pm => {
      let pmName = pm.name || "";
      const pmQty = String(pm.qty || 0);
      const pmTot = formatCurrency(pm.total || 0);
      if (pmName.length > 14) {
        text += pmName + "\n";
        text += padRight("", 15) + padLeft(pmQty, 4) + padLeft(pmTot, 13) + "\n";
      } else {
        text += padRight(pmName, 15) + padLeft(pmQty, 4) + padLeft(pmTot, 13) + "\n";
      }
    });
  } else {
    text += padRight("-", 15) + padLeft("0", 4) + padLeft(formatCurrency(0), 13) + "\n";
  }

  text += "-".repeat(WIDTH) + "\n";
  text += '\x1B\x45\x01';
  const totPayQty = String(settlementData.totalPaymentsQty || 0);
  const totPayAmt = formatCurrency(settlementData.totalPaymentsAmount || 0);
  text += padRight("Total Pembayaran", 15) + padLeft(totPayQty, 4) + padLeft(totPayAmt, 13) + "\n";
  text += '\x1B\x45\x00';
  text += "\n";

  // Section 4: TOTAL KESELURUHAN
  text += '\x1B\x45\x01';
  text += "TOTAL KESELURUHAN\n";
  text += '\x1B\x45\x00';
  const txTot = formatCurrency(settlementData.totalTransactions || 0);
  const discTot = formatCurrency(settlementData.totalDiscount || 0);
  const grandTot = formatCurrency(settlementData.grandTotal || 0);

  text += padRight("Total Transaksi", 17) + ": " + padLeft(txTot, 13) + "\n";
  text += padRight("Total Discount", 17) + ": " + padLeft(discTot, 13) + "\n";
  text += "-".repeat(WIDTH) + "\n";
  text += '\x1B\x45\x01';
  text += padRight("Grand Total", 17) + ": " + padLeft(grandTot, 13) + "\n";
  text += '\x1B\x45\x00';
  text += "-".repeat(WIDTH) + "\n";

  // Footer
  text += '\x1B\x61\x01';
  text += '\x1B\x45\x01';
  text += "STATUS: BERHASIL / SETTLED\n";
  text += "TERIMA KASIH\n";
  text += '\x1B\x45\x00';
  text += "=".repeat(WIDTH) + "\n";

  return text;
};

export const printThermalReceiptIframe = (receiptHtml) => {
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
        <title>Settlement / Rekonsiliasi</title>
        <style>
          @page { size: auto; margin: 4mm; }
          body {
            margin: 0;
            padding: 4mm;
            font-family: 'Courier New', Courier, monospace;
            font-size: 11px;
            color: #000;
            background: #fff;
            width: 72mm;
            max-width: 80mm;
          }
          * { box-sizing: border-box; }
          .center { text-align: center; }
          .right { text-align: right; }
          .left { text-align: left; }
          .bold { font-weight: bold; }
          .divider-double { border-top: 1.5px dashed #000; margin: 6px 0; }
          .divider-single { border-top: 1px dashed #000; margin: 6px 0; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th, td { padding: 2px 0; vertical-align: top; }
          .nowrap { white-space: nowrap; }
          .border-b { border-bottom: 1px solid #e5e7eb; }
          .border-dashed { border-style: dashed !important; }
          .border-dotted { border-style: dotted !important; }
          .border-t { border-top: 1px solid #e5e7eb; }
          .border-t-2 { border-top: 2px solid #000; }
          .border-gray-900 { border-color: #000 !important; }
          .border-gray-400 { border-color: #666 !important; }
          .border-gray-300 { border-color: #999 !important; }
          .flex { display: flex; }
          .justify-between { justify-content: space-between; }
          .uppercase { text-transform: uppercase; }
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
