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
