import React, { useState, useEffect, useRef } from "react";
import { X, Printer, Calendar, RefreshCw, Bluetooth, Check, AlertCircle, FileText } from "lucide-react";
import moment from "moment-timezone";
import { supabase } from "../lib/supabase";
import { formatSettlementReceiptEscPos, printThermalReceiptIframe, printViaBluetooth, isBluetoothConnected, getCachedBluetoothDevice } from "../utils/printer";
import { fetchSettlementData } from "../utils/settlement";

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
  const isPrintingRef = useRef(false);

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
      const data = await fetchSettlementData(supabase, dateStr, categoryFilter, storeProfile);
      setSettlementData(data);
    } catch (err) {
      console.error("Error loading settlement data:", err);
      setError("Gagal mengambil data settlement: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async () => {
    if (!settlementData || isPrintingRef.current || isPrinting) return;
    isPrintingRef.current = true;
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
        isPrintingRef.current = false;
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
        isPrintingRef.current = false;
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
              <h2 className="text-xl font-bold text-gray-900">Print Settlement / Rekonsiliasi</h2>
              <p className="text-xs text-gray-500">Laporan rekapitulasi harian penjualan, potongan promo & pembayaran</p>
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
                <span className="text-xs font-semibold text-gray-500">Tanggal:</span>
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
                Hari Ini
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
                Kemarin
              </button>

              {/* Category Filter */}
              <div className="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-xl border border-gray-300 shadow-sm">
                <span className="text-xs font-semibold text-gray-500">Kategori:</span>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="text-xs sm:text-sm font-medium text-gray-800 bg-transparent outline-none cursor-pointer"
                >
                  <option value="ALL">Semua (Cafe & Court)</option>
                  <option value="CAFE">Cafe Saja</option>
                  <option value="COURT">Court Saja</option>
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
                    ({hardwareType === "bluetooth" ? "Ganti ke Browser" : "Ganti ke Bluetooth"})
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handlePrint}
                disabled={loading || !settlementData || isPrinting}
                className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-xl flex items-center space-x-2 shadow-md shadow-emerald-200 transition-all text-sm cursor-pointer whitespace-nowrap"
                title={`Cetak Settlement via ${hardwareName}`}
              >
                <Printer size={16} className={isPrinting ? "animate-spin" : ""} />
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
                  Ditemukan <strong>{settlementData.matchedTxCount}</strong> transaksi selesai untuk kategori ini.
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

              {/* SECTION 3: REFUND */}
              <div className="my-2">
                <div className="font-bold uppercase text-black text-xs sm:text-sm mb-1.5">
                  REFUND
                </div>

                <table className="w-full text-left border-collapse" style={{ tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: "48%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "34%" }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-dashed border-gray-400">
                      <th className="py-0.5 font-semibold text-gray-800 text-left">Menu</th>
                      <th className="py-0.5 font-semibold text-center">Qty</th>
                      <th className="py-0.5 font-semibold text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settlementData.refunds && settlementData.refunds.length > 0 ? (
                      settlementData.refunds.map((r, idx) => (
                        <tr key={idx} className="border-b border-gray-100/60">
                          <td className="py-0.5 pr-1 align-top text-gray-900 break-words">{r.name}</td>
                          <td className="py-0.5 text-center align-top text-gray-800">{r.qty}</td>
                          <td className="py-0.5 text-right align-top whitespace-nowrap text-gray-900">
                            {formatCurrency(r.total)}
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
                      <td className="pt-1.5 text-left break-words">Total Refund</td>
                      <td className="pt-1.5 text-center">{settlementData.totalRefundQty || 0}</td>
                      <td className="pt-1.5 text-right whitespace-nowrap">{formatCurrency(settlementData.totalRefundAmount || 0)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Single Divider */}
              <div className="border-t border-dashed border-gray-900 my-2.5"></div>

              {/* SECTION 4: PAYMENT METHOD */}
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

              {/* SECTION 5: TOTAL KESELURUHAN */}
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

                {(settlementData.totalRefundAmount || 0) > 0 && (
                  <div className="flex justify-between py-0.5 text-red-600">
                    <span>Total Refund</span>
                    <span className="font-medium whitespace-nowrap">-{formatCurrency(settlementData.totalRefundAmount)}</span>
                  </div>
                )}

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
