import React, { useState, useEffect, useRef } from "react";
import { X, Printer, Calendar, RefreshCw, Bluetooth, Check, AlertCircle, FileText } from "lucide-react";
import moment from "moment-timezone";
import { supabase } from "../lib/supabase";
import { formatSettlementReceiptEscPos, printThermalReceiptIframe, printViaBluetooth, isBluetoothConnected, getCachedBluetoothDevice } from "../utils/printer";

const TIMEZONE = "Asia/Jakarta";

export default function SettlementModal({ isOpen, onClose, storeProfile: initialStoreProfile }) {
  const initToday = moment().tz(TIMEZONE).format("YYYY-MM-DD");
  const [selectedDate, setSelectedDate] = useState(initToday);
  const [selectedCategory, setSelectedCategory] = useState("ALL"); // ALL, CAFE, COURT
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [settlementData, setSettlementData] = useState(null);
  const [storeProfile, setStoreProfile] = useState(initialStoreProfile || null);
  const [bluetoothStatus, setBluetoothStatus] = useState("");
  const [hardwareType, setHardwareType] = useState("browser"); // "bluetooth" | "browser"
  const [hardwareName, setHardwareName] = useState("Printer Sistem / Browser");
  const [isPrinting, setIsPrinting] = useState(false);
  const [paperSize, setPaperSize] = useState("58mm"); // "58mm" | "80mm"
  const [fontSize, setFontSize] = useState("compact"); // "compact" | "normal" | "large"
  const receiptRef = useRef(null);

  const detectHardware = async () => {
    if (isBluetoothConnected()) {
      setHardwareType("bluetooth");
      setHardwareName(getCachedBluetoothDevice()?.name || "Printer Bluetooth");
      return;
    }
    if (typeof navigator !== "undefined" && navigator.bluetooth && navigator.bluetooth.getDevices) {
      try {
        const devices = await navigator.bluetooth.getDevices();
        if (devices && devices.length > 0) {
          setHardwareType("bluetooth");
          setHardwareName(devices[0].name || "Printer Bluetooth");
          return;
        }
      } catch (e) {}
    }
    setHardwareType("browser");
    setHardwareName("Printer Sistem / Browser");
  };

  useEffect(() => {
    if (isOpen) {
      detectHardware();
      if (!storeProfile) {
        supabase.from("store_profile").select("*").single().then(({ data }) => {
          if (data) setStoreProfile(data);
        });
      }
      loadSettlement(selectedDate, selectedCategory);
    }
  }, [isOpen, selectedDate, selectedCategory]);

  const loadSettlement = async (dateStr, categoryFilter) => {
    setLoading(true);
    setError(null);
    setBluetoothStatus("");
    try {
      const start = moment.tz(`${dateStr}T00:00:00.000`, TIMEZONE).toISOString();
      const end = moment.tz(`${dateStr}T23:59:59.999`, TIMEZONE).toISOString();

      // 1. Fetch menu mapping
      const { data: menuData, error: menuErr } = await supabase
        .from("menu")
        .select("menu_id, name, category, price");
      if (menuErr) throw menuErr;

      const menuMap = {};
      const menuNameMap = {};
      (menuData || []).forEach(m => {
        menuMap[m.menu_id] = m;
        if (m.name) menuNameMap[m.name.trim().toLowerCase()] = m;
      });

      // Helper to check if item is Court related
      const isItemCourt = (item, cleanName) => {
        const m = menuMap[item.menu_id];
        if (m?.category && m.category.toLowerCase() === "court") return true;
        const name = (cleanName || item.menu_name || "").toLowerCase();
        if (name.includes("court") || name.includes("lapangan") || name.includes("padel")) return true;
        return false;
      };

      // Helper to normalize category name
      const normalizeCategory = (cat) => {
        if (!cat) return "Other";
        const trimmed = cat.trim();
        const lower = trimmed.toLowerCase();
        if (lower === "coffee") return "Coffee";
        if (lower === "non-coffee" || lower === "non coffee" || lower === "noncoffee") return "Non-Coffee";
        if (lower === "food" || lower === "foods") return "Food";
        if (lower === "beverage" || lower === "beverages" || lower === "drink" || lower === "drinks") return "Beverage";
        if (lower === "snack" || lower === "snacks") return "Snack";
        if (lower === "add-ons" || lower === "add-on" || lower === "addons" || lower === "addon") return "Add-Ons";
        if (lower === "court" || lower === "lapangan") return "Court";
        return trimmed.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
      };

      const getItemCategory = (item, cleanName) => {
        const m = menuMap[item.menu_id];
        let cat = m?.category;
        if (!cat || cat === "Unknown") {
          const byName = menuNameMap[cleanName.trim().toLowerCase()];
          if (byName?.category) cat = byName.category;
        }
        if (!cat || cat === "Unknown") {
          if (isItemCourt(item, cleanName)) {
            cat = "Court";
          } else {
            cat = "Other";
          }
        }
        return normalizeCategory(cat);
      };

      // 2. Fetch transactions for date
      const { data: txs, error: txErr } = await supabase
        .from("transactions")
        .select("*, transaction_items(*)")
        .gte("date", start)
        .lte("date", end)
        .not("status", "eq", "REFUND")
        .not("status", "eq", "VOID")
        .order("date", { ascending: true });

      if (txErr) throw txErr;

      // 3. Process transactions
      const itemAgg = {};
      const promoAgg = {};
      const pmAgg = {};
      let totalDiscount = 0;
      let grandTotal = 0;
      let matchedTxCount = 0;

      (txs || []).forEach(t => {
        // Determine whether transaction matches categoryFilter
        const hasCourtItem = t.transaction_items?.some(i => {
          let clean = i.menu_name || "";
          if (clean.includes(" [")) clean = clean.split(" [")[0];
          if (clean.includes(" (Note:")) clean = clean.split(" (Note:")[0];
          return isItemCourt(i, clean);
        });
        const isCourtTx = t.table_no === "Court" || hasCourtItem;

        if (categoryFilter === "COURT" && !isCourtTx) return;
        if (categoryFilter === "CAFE" && isCourtTx) return;

        matchedTxCount += 1;
        grandTotal += Number(t.total_price || 0);
        totalDiscount += Number(t.discount || 0);

        // Promos / Discounts
        if (Number(t.discount) > 0) {
          let pName = "Diskon / Promo";
          if (t.notes) {
            try {
              const parsed = JSON.parse(t.notes);
              if (parsed && parsed.promo_name) pName = parsed.promo_name;
            } catch (e) {}
          } else if (t.payment_method === "Staff Beverage") {
            pName = "Staff Beverage";
          }
          if (!promoAgg[pName]) promoAgg[pName] = { name: pName, qty: 0, discount: 0 };
          promoAgg[pName].qty += 1;
          promoAgg[pName].discount += Number(t.discount);
        }

        // Payment Methods
        const rawPm = t.payment_method || "Other";
        if (rawPm.includes(" (Rp ")) {
          const parts = rawPm.split(", ");
          parts.forEach(part => {
            const match = part.match(/^(.*?)\s*\(Rp\s*([\d\.,]+)\)$/);
            if (match) {
              const name = match[1].trim();
              const amt = Number(match[2].replace(/\./g, "")) || 0;
              if (!pmAgg[name]) pmAgg[name] = { name, qty: 0, total: 0 };
              pmAgg[name].qty += 1;
              pmAgg[name].total += amt;
            } else {
              const name = part.split(" (Rp ")[0].trim();
              if (!pmAgg[name]) pmAgg[name] = { name, qty: 0, total: 0 };
              pmAgg[name].qty += 1;
              pmAgg[name].total += Number(t.total_price);
            }
          });
        } else {
          if (!pmAgg[rawPm]) pmAgg[rawPm] = { name: rawPm, qty: 0, total: 0 };
          pmAgg[rawPm].qty += 1;
          pmAgg[rawPm].total += Number(t.total_price);
        }

        // Items sold
        if (t.transaction_items) {
          t.transaction_items.forEach(item => {
            let cleanName = item.menu_name || "";
            if (cleanName.includes(" [")) cleanName = cleanName.split(" [")[0];
            if (cleanName.includes(" (Note:")) cleanName = cleanName.split(" (Note:")[0];
            
            const itemCategory = getItemCategory(item, cleanName);

            if (categoryFilter === "COURT" && itemCategory !== "Court") return;
            if (categoryFilter === "CAFE" && itemCategory === "Court") return;

            let parsedAddons = [];
            if (typeof item.addons === "string") {
              try { parsedAddons = JSON.parse(item.addons); } catch (e) {}
            } else {
              parsedAddons = item.addons || [];
            }

            let itemAddonsTotal = 0;
            if (parsedAddons && Array.isArray(parsedAddons)) {
              parsedAddons.forEach(addon => {
                const addonRev = Number(addon.price) * Number(item.qty);
                itemAddonsTotal += addonRev;
                if (categoryFilter === "ALL" || categoryFilter === "CAFE") {
                  const aKey = `Add-Ons___${addon.name}`;
                  if (!itemAgg[aKey]) {
                    itemAgg[aKey] = { name: addon.name, category: "Add-Ons", qty: 0, total: 0 };
                  }
                  itemAgg[aKey].qty += Number(item.qty);
                  itemAgg[aKey].total += addonRev;
                }
              });
            }

            const baseTotal = Number(item.subtotal) - itemAddonsTotal;
            const itemKey = `${itemCategory}___${cleanName}`;
            if (!itemAgg[itemKey]) {
              itemAgg[itemKey] = { name: cleanName, category: itemCategory, qty: 0, total: 0 };
            }
            itemAgg[itemKey].qty += Number(item.qty);
            itemAgg[itemKey].total += baseTotal;
          });
        }
      });

      const allAggregatedItems = Object.values(itemAgg);

      // Group items by category
      const groupsMap = {};
      allAggregatedItems.forEach(item => {
        const cat = item.category || "Other";
        if (!groupsMap[cat]) {
          groupsMap[cat] = {
            category: cat,
            items: [],
            totalQty: 0,
            subtotal: 0
          };
        }
        groupsMap[cat].items.push(item);
        groupsMap[cat].totalQty += item.qty;
        groupsMap[cat].subtotal += item.total;
      });

      const CANONICAL_ORDER = [
        "Coffee",
        "Non-Coffee",
        "Food",
        "Beverage",
        "Snack",
        "Add-Ons",
        "Court",
        "Other"
      ];

      const getCategoryRank = (cat) => {
        const idx = CANONICAL_ORDER.findIndex(c => c.toLowerCase() === cat.toLowerCase());
        return idx !== -1 ? idx : 50;
      };

      const categoryGroups = Object.values(groupsMap).sort((a, b) => {
        const rankA = getCategoryRank(a.category);
        const rankB = getCategoryRank(b.category);
        if (rankA !== rankB) return rankA - rankB;
        return a.category.localeCompare(b.category);
      });

      categoryGroups.forEach(group => {
        group.items.sort((a, b) => b.qty - a.qty || b.total - a.total || a.name.localeCompare(b.name));
      });

      const items = categoryGroups.flatMap(g => g.items);
      const itemsSubtotal = categoryGroups.reduce((sum, g) => sum + g.subtotal, 0);
      const itemsTotalQty = categoryGroups.reduce((sum, g) => sum + g.totalQty, 0);

      const promos = Object.values(promoAgg);
      const totalPromoQty = promos.reduce((sum, p) => sum + p.qty, 0);
      const totalPromoDiscount = promos.reduce((sum, p) => sum + p.discount, 0);

      const paymentMethods = Object.values(pmAgg).sort((a, b) => b.total - a.total);
      const totalPaymentsQty = paymentMethods.reduce((sum, pm) => sum + pm.qty, 0);
      const totalPaymentsAmount = paymentMethods.reduce((sum, pm) => sum + pm.total, 0);

      let categoryHeader = "CAFE & COURT";
      if (categoryFilter === "CAFE") categoryHeader = "CAFE";
      if (categoryFilter === "COURT") categoryHeader = "COURT";

      const formattedDate = moment(dateStr).format("DD/MM/YYYY");

      setSettlementData({
        storeProfile: storeProfile || { store_name: "ADA Padel & Coffee", address: "BSD City, Tangerang" },
        date: dateStr,
        formattedDate,
        categoryFilter,
        categoryHeader,
        matchedTxCount,
        categoryGroups,
        items,
        itemsSubtotal,
        itemsTotalQty,
        promos,
        totalPromoQty,
        totalPromoDiscount,
        paymentMethods,
        totalPaymentsQty,
        totalPaymentsAmount,
        totalTransactions: itemsSubtotal,
        totalDiscount,
        grandTotal: itemsSubtotal - totalDiscount
      });
    } catch (err) {
      console.error("Error loading settlement data:", err);
      setError("Gagal mengambil data settlement: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async () => {
    if (!settlementData) return;
    setIsPrinting(true);
    setBluetoothStatus("");

    const hasBluetooth = isBluetoothConnected() || (hardwareType === "bluetooth");

    if (hasBluetooth) {
    setBluetoothStatus("Menghubungkan ke printer bluetooth...");
    try {
      const escPosText = formatSettlementReceiptEscPos(settlementData, {
          paperSize,
          compactFont: false
        });
      await printViaBluetooth(escPosText);
      setBluetoothStatus("Berhasil dicetak via Bluetooth!");
      detectHardware();
      setTimeout(() => setBluetoothStatus(""), 4000);
    } catch (err) {
      console.error("Bluetooth print failed:", err);
       // Fallback otomatis ke dialog browser jika bluetooth gagal
        setBluetoothStatus("Bluetooth gagal, mencetak via printer browser...");
        if (receiptRef.current) {
          printThermalReceiptIframe(receiptRef.current.innerHTML, { paperSize, fontSize });
        }
        setTimeout(() => setBluetoothStatus(""), 3000);
      } finally {
        setIsPrinting(false);
      }
    } else {
      // Hardware Printer Sistem / Browser
      setBluetoothStatus("Membuka dialog cetak...");
      try {
        if (receiptRef.current) {
          printThermalReceiptIframe(receiptRef.current.innerHTML, { paperSize, fontSize });
        }
      } catch (err) {
        console.error("Browser print failed:", err);
      } finally {
        setIsPrinting(false);
        setTimeout(() => setBluetoothStatus(""), 3000);
      }
    }
  };

  const handleToggleHardware = async () => {
    if (hardwareType === "bluetooth") {
      setHardwareType("browser");
      setHardwareName("Printer Sistem / Browser");
      setBluetoothStatus("Beralih ke printer browser / sistem");
      setTimeout(() => setBluetoothStatus(""), 3000);
    } else {
      if (!navigator.bluetooth) {
        alert("Browser ini tidak mendukung Web Bluetooth.");
        return;
      }
      try {
        setBluetoothStatus("Mencari printer Bluetooth...");
        const device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [
            '000018f0-0000-1000-8000-00805f9b34fb', 
            'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
            '49535343-fe7d-4ae5-8fa9-9fafd205e455'
          ]
        });
        if (device) {
          setHardwareType("bluetooth");
          setHardwareName(device.name || "Printer Bluetooth");
          setBluetoothStatus(`Tersambung ke ${device.name || "Printer Bluetooth"}`);
          setTimeout(() => setBluetoothStatus(""), 4000);
        }
      } catch (e) {
        if (e.name !== "NotFoundError") {
          setBluetoothStatus("Gagal menghubungkan Bluetooth: " + e.message);
        } else {
          setBluetoothStatus("");
        }
      }
    }
  };

  if (!isOpen) return null;

  const formatCurrency = (val) => "Rp " + Number(val || 0).toLocaleString("id-ID");

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full flex flex-col max-h-[92vh] overflow-hidden border border-gray-100">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-2xl">
              <Printer size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Print End Of Day Report</h2>
              <p className="text-xs text-gray-500">Daily sales summary, promo discounts & payment reports</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Toolbar & Filters */}
        <div className="px-6 py-4 bg-gray-50/80 border-b border-gray-200 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-4">
            
            {/* Filter Inputs */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-xl border border-gray-300 shadow-sm">
                <Calendar size={16} className="text-gray-500" />
                <span className="text-xs font-semibold text-gray-500">Date:</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="text-sm font-medium text-gray-800 bg-transparent outline-none cursor-pointer"
                />
              </div>

              {/* Quick Date buttons */}
              <button
                type="button"
                onClick={() => setSelectedDate(moment().tz(TIMEZONE).format("YYYY-MM-DD"))}
                className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors border ${
                  selectedDate === moment().tz(TIMEZONE).format("YYYY-MM-DD")
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setSelectedDate(moment().tz(TIMEZONE).subtract(1, "days").format("YYYY-MM-DD"))}
                className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors border ${
                  selectedDate === moment().tz(TIMEZONE).subtract(1, "days").format("YYYY-MM-DD")
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
                }`}
              >
                Yesterday
              </button>

              {/* Category Filter */}
              <div className="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-xl border border-gray-300 shadow-sm">
                <span className="text-xs font-semibold text-gray-500">Type Order:</span>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="text-xs sm:text-sm font-medium text-gray-800 bg-transparent outline-none cursor-pointer"
                >
                  <option value="ALL">All (Cafe & Court)</option>
                  <option value="CAFE">Cafe Only</option>
                  <option value="COURT">Court Only</option>
                </select>
              </div>
              
              {/* Paper Size selector */}
              <div className="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-xl border border-gray-300 shadow-sm">
                <span className="text-xs font-semibold text-gray-500">Kertas:</span>
                <select
                  value={paperSize}
                  onChange={(e) => setPaperSize(e.target.value)}
                  className="text-xs font-medium text-gray-800 bg-transparent outline-none cursor-pointer"
                  title="Pilih ukuran kertas thermal printer"
                >
                  <option value="58mm">58mm (Standar POS)</option>
                  <option value="80mm">80mm (Lebar)</option>
                </select>
              </div>

              {/* Font Size selector */}
              <div className="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-xl border border-gray-300 shadow-sm">
                <span className="text-xs font-semibold text-gray-500">Font:</span>
                <select
                  value={fontSize}
                  onChange={(e) => setFontSize(e.target.value)}
                  className="text-xs font-medium text-gray-800 bg-transparent outline-none cursor-pointer"
                  title="Sesuaikan ukuran font jika hasil cetak terpotong"
                >
                  <option value="compact">Kecil (Compact - Anti Terpotong)</option>
                  <option value="normal">Sedang (Normal)</option>
                  <option value="large">Besar (Large)</option>
                </select>
              </div>

              <button
                type="button"
                onClick={() => loadSettlement(selectedDate, selectedCategory)}
                disabled={loading}
                className="p-2 text-gray-600 hover:text-emerald-600 hover:bg-white rounded-xl border border-gray-300 transition-colors"
                title="Refresh Data"
              >
                <RefreshCw size={16} className={loading ? "animate-spin text-emerald-600" : ""} />
              </button>
            </div>

            {/* Single Print Button and Hardware Status */}
            <div className="flex items-center space-x-3">
              <div className="flex items-center gap-1.5 text-xs text-gray-600 bg-white px-3 py-1.5 rounded-xl border border-gray-300 shadow-sm">
                <span className={`inline-block w-2 h-2 rounded-full ${hardwareType === "bluetooth" ? "bg-emerald-500 animate-pulse" : "bg-blue-500"}`}></span>
                <span className="font-medium">Hardware: <strong>{hardwareName}</strong></span>
                {typeof navigator !== "undefined" && navigator.bluetooth && (
              <button
                type="button"
                onClick={handleToggleHardware}
                    className="text-emerald-700 hover:text-emerald-800 hover:underline text-[11px] font-semibold ml-1 cursor-pointer"
                    title={hardwareType === "bluetooth" ? "Beralih ke printer sistem / browser" : "Hubungkan printer bluetooth"}
                  >
                    ({hardwareType === "bluetooth" ? "Change to Browser" : "Change to Bluetooth"})
              </button>
              )}
              </div>

              <button
                type="button"
                onClick={handlePrint}
                disabled={loading || !settlementData || isPrinting}
                className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-xl flex items-center space-x-2 shadow-md shadow-emerald-200 transition-all text-sm cursor-pointer whitespace-nowrap"
                title={`Cetak Settlement via ${hardwareName}`}
              >
                <Printer size={16} />
                <span>{isPrinting ? "Mencetak..." : "Print"}</span>
              </button>
            </div>

          </div>

          {/* Status Bar */}
          <div className="mt-2.5 flex items-center justify-between text-xs text-gray-500">
            <div>
              {loading ? (
                <span className="text-blue-600 flex items-center gap-1 font-medium">
                  <RefreshCw size={12} className="animate-spin" /> Memuat data transaksi...
                </span>
              ) : settlementData ? (
                <span className="text-gray-600">
                  Found <strong>{settlementData.matchedTxCount}</strong> completed transactions for this category.
                </span>
              ) : null}
            </div>
            {bluetoothStatus && (
              <span className={`font-medium ${bluetoothStatus.includes("Gagal") ? "text-red-500" : "text-emerald-600"}`}>
                {bluetoothStatus}
              </span>
            )}
          </div>
        </div>

        {/* Modal Body: Thermal Paper Preview */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-neutral-200/70 flex justify-center items-start">
          {error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-center space-x-3 my-8">
              <AlertCircle size={20} className="shrink-0" />
              <span>{error}</span>
            </div>
          ) : settlementData ? (
             /* Thermal Receipt Container (Matches uploaded image & prevents thermal cutoffs) */
            <div
              ref={receiptRef}
              id="settlement-receipt-print"
              className={`bg-white text-gray-900 shadow-xl border border-gray-200 p-3.5 sm:p-5 font-mono select-text transition-all ${
                paperSize === "58mm" ? "max-w-[340px]" : "max-w-[460px]"
              } ${
                fontSize === "compact"
                  ? "text-[11px] leading-snug"
                  : fontSize === "normal"
                  ? "text-xs sm:text-[13px] leading-normal"
                  : "text-sm leading-relaxed"
              } w-full rounded-sm`}
              style={{ fontFamily: "'Courier New', Courier, monospace" }}
            >
              {/* Header */}
              <div className="text-center mb-2.5">
                <div className="font-bold text-sm sm:text-base uppercase tracking-wider text-black">
                  {storeProfile?.store_name || "ADA PADEL & COFFEE SHOP"}
                </div>
                <div className="text-xs text-gray-600 mt-0.5">
                  {storeProfile?.address || "BSD City, Tangerang"}
                </div>
                {storeProfile?.phone && (
                  <div className="text-xs text-gray-600">
                    Telp: {storeProfile.phone}
                  </div>
                )}
              </div>

              {/* Double Divider */}
              <div className="border-t-2 border-dashed border-gray-900 my-2"></div>

              {/* Title & Date */}
              <div className="text-center my-1.5">
                <div className="font-bold tracking-widest text-xs sm:text-sm text-black">
                  SETTLEMENT / REKONSILIASI
                </div>
                <div className="mt-0.5 text-xs text-gray-800">
                  TANGGAL : {settlementData.formattedDate}
                </div>
              </div>

              {/* Single Divider */}
              <div className="border-t border-dashed border-gray-900 my-2"></div>

              {/* SECTION 1: MENU / KATEGORI (CAFE / COURT / COFFEE / NON-COFFEE / FOOD, etc.) */}
              <div className="my-2">
                <div className="font-bold uppercase text-black text-xs sm:text-sm mb-1.5">
                  {settlementData.categoryHeader}
                </div>

                {settlementData.categoryGroups && settlementData.categoryGroups.length > 0 ? (
                  settlementData.categoryGroups.map((group, gIdx) => (
                    <div key={gIdx} className={gIdx > 0 ? "mt-2.5 pt-2 border-t border-dashed border-gray-300" : ""}>
                      {/* Sub-Header Jenis Menu (e.g. [COFFEE], [NON-COFFEE], [FOOD], [COURT]) */}
                      <div className="font-bold uppercase text-black text-[11px] sm:text-xs mb-1">
                        [ {group.category} ]
                </div>
                
                <table className="w-full text-left border-collapse" style={{ tableLayout: "fixed" }}>
                        <colgroup>
                          <col style={{ width: "48%" }} />
                          <col style={{ width: "18%" }} />
                          <col style={{ width: "34%" }} />
                        </colgroup>
                  <thead>
                    <tr className="border-b border-dashed border-gray-400 text-gray-700">
                        <th className="py-0.5 font-semibold text-gray-800 text-left">Menu</th>
                        <th className="py-0.5 font-semibold text-center">Qty</th>
                        <th className="py-0.5 font-semibold text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item, idx) => (
                        <tr key={idx} className="border-b border-gray-100/60">
                            <td className="py-0.5 pr-1 align-top text-gray-900 break-words">{item.name}</td>
                            <td className="py-0.5 text-center align-top text-gray-800">{item.qty}</td>
                            <td className="py-0.5 text-right align-top whitespace-nowrap text-gray-900">
                            {formatCurrency(item.total)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                  <tfoot>
                          <tr className="border-t border-dotted border-gray-400 font-semibold text-gray-800">
                            <td className="pt-1 text-left break-words">Subtotal {group.category}</td>
                            <td className="pt-1 text-center">{group.totalQty}</td>
                            <td className="pt-1 text-right whitespace-nowrap">{formatCurrency(group.subtotal)}</td>
                          </tr>
                        </tfoot>
                </table>
                    </div>
                  ))
                ) : (
                  <div className="py-2 text-center text-gray-500 italic">
                    (Tidak ada item terjual)
                  </div>
                )}

                {/* Subtotal / Total Keseluruhan Menu */}
                <table className="w-full text-left border-collapse mt-2.5" style={{ tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: "48%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "34%" }} />
                  </colgroup>
                  <tfoot>
                    <tr className="border-t-2 border-dashed border-gray-900 font-bold text-black">
                      <td className="pt-1.5 text-left break-words">TOTAL {settlementData.categoryHeader}</td>
                      <td className="pt-1.5 text-center">{settlementData.itemsTotalQty}</td>
                      <td className="pt-1.5 text-right whitespace-nowrap">{formatCurrency(settlementData.itemsSubtotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Single Divider */}
              <div className="border-t border-dashed border-gray-900 my-2.5"></div>

              {/* SECTION 2: PROMO */}
              <div className="my-2">
                <div className="font-bold uppercase text-black text-xs sm:text-sm mb-1.5">
                  PROMO
                </div>

                <table className="w-full text-left border-collapse" style={{ tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: "48%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "34%" }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-dashed border-gray-400">
                      <th className="py-0.5 font-semibold text-gray-800 text-left">Promo</th>
                      <th className="py-0.5 font-semibold text-center">Qty</th>
                      <th className="py-0.5 font-semibold text-right">Potongan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settlementData.promos && settlementData.promos.length > 0 ? (
                      settlementData.promos.map((promo, idx) => (
                        <tr key={idx} className="border-b border-gray-100/60">
                          <td className="py-0.5 pr-1 align-top text-gray-900 break-words">{promo.name}</td>
                          <td className="py-0.5 text-center align-top text-gray-800">{promo.qty}</td>
                          <td className="py-0.5 text-right align-top whitespace-nowrap text-gray-900">
                            {formatCurrency(promo.discount)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="py-0.5 text-gray-500">-</td>
                        <td className="py-0.5 text-center text-gray-500">0</td>
                        <td className="py-0.5 text-right text-gray-500">{formatCurrency(0)}</td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-dashed border-gray-900 font-bold text-black">
                      <td className="pt-1.5 text-left break-words">Total Potongan</td>
                      <td className="pt-1.5 text-center">{settlementData.totalPromoQty}</td>
                      <td className="pt-1.5 text-right whitespace-nowrap">{formatCurrency(settlementData.totalPromoDiscount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Single Divider */}
              <div className="border-t border-dashed border-gray-900 my-2.5"></div>

              {/* SECTION 3: PAYMENT METHOD */}
              <div className="my-2">
                <div className="font-bold uppercase text-black text-xs sm:text-sm mb-1.5">
                  PAYMENT METHOD
                </div>

                <table className="w-full text-left border-collapse" style={{ tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: "48%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "34%" }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-dashed border-gray-400">
                      <th className="py-0.5 font-semibold text-gray-800 text-left">Metode Bayar</th>
                      <th className="py-0.5 font-semibold text-center">Qty</th>
                      <th className="py-0.5 font-semibold text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settlementData.paymentMethods && settlementData.paymentMethods.length > 0 ? (
                      settlementData.paymentMethods.map((pm, idx) => (
                        <tr key={idx} className="border-b border-gray-100/60">
                          <td className="py-0.5 pr-1 align-top text-gray-900 break-words">{pm.name}</td>
                          <td className="py-0.5 text-center align-top text-gray-800">{pm.qty}</td>
                          <td className="py-0.5 text-right align-top whitespace-nowrap text-gray-900">
                            {formatCurrency(pm.total)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="py-0.5 text-gray-500">-</td>
                        <td className="py-0.5 text-center text-gray-500">0</td>
                        <td className="py-0.5 text-right text-gray-500">{formatCurrency(0)}</td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-dashed border-gray-900 font-bold text-black">
                      <td className="pt-1.5 text-left break-words">Total Bayar</td>
                      <td className="pt-1.5 text-center">{settlementData.totalPaymentsQty}</td>
                      <td className="pt-1.5 text-right whitespace-nowrap">{formatCurrency(settlementData.totalPaymentsAmount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Single Divider */}
              <div className="border-t border-dashed border-gray-900 my-2.5"></div>

              {/* SECTION 4: TOTAL KESELURUHAN */}
              <div className="my-2 space-y-1">
                <div className="font-bold uppercase text-black text-xs sm:text-sm mb-1.5">
                  TOTAL KESELURUHAN
                </div>

                <div className="flex justify-between py-0.5">
                  <span className="text-gray-800">Total Transaksi</span>
                  <span className="font-medium whitespace-nowrap">{formatCurrency(settlementData.totalTransactions)}</span>
                </div>

                <div className="flex justify-between py-0.5">
                  <span className="text-gray-800">Total Discount</span>
                  <span className="font-medium whitespace-nowrap">-{formatCurrency(settlementData.totalDiscount)}</span>
                </div>

                <div className="border-t border-dashed border-gray-900 my-1.5 pt-1.5 flex justify-between font-bold text-xs sm:text-sm text-black">
                  <span>Grand Total</span>
                  <span className="whitespace-nowrap">{formatCurrency(settlementData.grandTotal)}</span>
                </div>
              </div>

              {/* Single Divider */}
              <div className="border-t border-dashed border-gray-900 my-2.5"></div>

              {/* Footer */}
              <div className="text-center my-2 space-y-0.5">
                <div className="font-bold uppercase tracking-wider text-black text-xs">
                  STATUS: BERHASIL / SETTLED
                </div>
                <div className="text-gray-700 tracking-wide text-[11px]">
                  TERIMA KASIH
                </div>
              </div>

              {/* Bottom Double Divider */}
              <div className="border-t-2 border-dashed border-gray-900 mt-2"></div>
            </div>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-white shrink-0">
          <div className="text-xs text-gray-500">
            Cetak otomatis disesuaikan dengan hardware printer yang aktif ({hardwareName}).
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded-xl transition-colors border border-gray-200"
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  );
}
