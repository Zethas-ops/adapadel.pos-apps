import React, { useState } from "react";
import { X, Printer, ChefHat, Check } from "lucide-react";

export default function PrintTriggerModal({
  isOpen,
  onClose,
  type = "payment", // "payment" | "save_bill"
  title,
  subtitle,
  onPrintReceipt,
  onPrintCaptainOrder,
  isAdditional = false,
  addedCount = 0,
  hardwareName = "Thermal Printer",
  initialReceiptPrinted = false
}) {
  const [isPrintingReceipt, setIsPrintingReceipt] = useState(false);
  const [isPrintingCaptain, setIsPrintingCaptain] = useState(false);
  const [receiptPrinted, setReceiptPrinted] = useState(initialReceiptPrinted);
  const [captainPrinted, setCaptainPrinted] = useState(false);
  const [message, setMessage] = useState("");

  React.useEffect(() => {
    if (isOpen) {
      setReceiptPrinted(initialReceiptPrinted);
      setCaptainPrinted(false);
      setMessage("");
    }
  }, [isOpen, initialReceiptPrinted]);

  if (!isOpen) return null;

  const defaultTitle = type === "save_bill" ? "Bill saved successfully" : "Payment successful";
  const defaultSubtitle = "Choose what to print on your single printer.";

  const handleReceiptClick = async () => {
    if (!onPrintReceipt || isPrintingReceipt) return;
    setIsPrintingReceipt(true);
    setMessage("");
    try {
      await onPrintReceipt();
      setReceiptPrinted(true);
      setMessage("Struk pembayaran berhasil dicetak!");
      setTimeout(() => setMessage(""), 3500);
    } catch (err) {
      console.error("Print receipt error:", err);
      setMessage(`Gagal mencetak struk: ${err.message || "Error"}`);
    } finally {
      setIsPrintingReceipt(false);
    }
  };

  const handleCaptainClick = async () => {
    if (!onPrintCaptainOrder || isPrintingCaptain) return;
    setIsPrintingCaptain(true);
    setMessage("");
    try {
      await onPrintCaptainOrder();
      setCaptainPrinted(true);
      setMessage("Captain order berhasil dicetak!");
      setTimeout(() => setMessage(""), 3500);
    } catch (err) {
      console.error("Print captain order error:", err);
      setMessage(`Gagal mencetak captain order: ${err.message || "Error"}`);
    } finally {
      setIsPrintingCaptain(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-sm w-full p-6 sm:p-7 border border-gray-100 dark:border-gray-700 relative">
        
        {/* Close Button X */}
        <button
          onClick={onClose}
          className="absolute right-5 top-5 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* Title & Subtitle */}
        <div className="mb-6 pr-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
            {title || defaultTitle}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 leading-snug">
            {subtitle || defaultSubtitle}
          </p>
        </div>

        {/* Status Message */}
        {message && (
          <div className={`mb-4 px-3 py-2 rounded-xl text-xs font-medium text-center ${
            message.includes("Gagal") 
              ? "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400" 
              : "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
          }`}>
            {message}
          </div>
        )}

        {/* Action Buttons Stack */}
        <div className="space-y-3">
          {/* Button 1: Print receipt (Only shown for Payment / Close Bill) */}
          {type === "payment" && (
            <button
              type="button"
              onClick={handleReceiptClick}
              disabled={isPrintingReceipt}
              className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-md shadow-blue-200 dark:shadow-none flex items-center justify-center space-x-2 text-sm cursor-pointer"
            >
              {receiptPrinted ? <Check size={18} /> : <Printer size={18} className={isPrintingReceipt ? "animate-spin" : ""} />}
              <span>{isPrintingReceipt ? "Printing..." : receiptPrinted ? "Print receipt (Printed ✓)" : "Print receipt"}</span>
            </button>
          )}

          {/* Button 2: Print captain order (Shown for both Payment and Save Bill) */}
          <button
            type="button"
            onClick={handleCaptainClick}
            disabled={isPrintingCaptain}
            className="w-full py-3.5 px-4 bg-[#4F46E5] hover:bg-[#4338CA] active:bg-[#3730A3] disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-md shadow-indigo-200 dark:shadow-none flex items-center justify-center space-x-2 text-sm cursor-pointer"
          >
            {captainPrinted ? <Check size={18} /> : <ChefHat size={18} className={isPrintingCaptain ? "animate-spin" : ""} />}
            <span>
              {isPrintingCaptain
                ? "Printing..."
                : captainPrinted
                ? "Print captain order (Printed ✓)"
                : isAdditional && addedCount > 0
                ? `Print captain order (${addedCount} tambahan)`
                : "Print captain order"}
            </span>
          </button>

          {/* Button 3: Close */}
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3.5 px-4 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-semibold rounded-xl transition-all text-sm cursor-pointer"
          >
            Close
          </button>
        </div>

        {/* Footer Hardware Info */}
        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 text-center text-[11px] text-gray-400">
          Single Printer: <span className="font-semibold text-gray-600 dark:text-gray-300">{hardwareName || "Bluetooth Thermal"}</span>
        </div>

      </div>
    </div>
  );
}
