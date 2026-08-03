import React, { useEffect, useState } from "react";
import { Search, Printer, Calendar, ChevronDown, ChevronUp, Trash2, X, RefreshCcw } from "lucide-react";
import moment from "moment-timezone";
import { supabase } from "../lib/supabase";
import { printViaBluetooth, formatReceiptText } from "../utils/printer";

const TIMEZONE = 'Asia/Jakarta';

function History() {
  const [transactions, setTransactions] = useState([]);
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState(moment().tz(TIMEZONE).format("YYYY-MM-DD"));
  const [endDate, setEndDate] = useState(moment().tz(TIMEZONE).format("YYYY-MM-DD"));
  const [page, setPage] = useState(1);
  const itemsPerPage = 20;
  const [expandedId, setExpandedId] = useState(null);
  const [storeProfile, setStoreProfile] = useState(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [transactionToRefund, setTransactionToRefund] = useState(null);
  const [refundType, setRefundType] = useState("Refund");
  const [refundReason, setRefundReason] = useState("");
  const [refundPassword, setRefundPassword] = useState("");
  const [refundError, setRefundError] = useState("");
  const [isRefunding, setIsRefunding] = useState(false);

  const userStr = localStorage.getItem("user");
  const user = userStr ? JSON.parse(userStr) : null;
  const isAdmin = user?.role === "ADMIN";

  useEffect(() => {
    fetchHistory();
    fetchStoreProfile();
  }, []);

  const fetchStoreProfile = async () => {
    try {
      const { data, error } = await supabase.from('store_profile').select('*').single();
      if (!error && data) {
        setStoreProfile(data);
      }
    } catch (err) {
      console.error("Error fetching store profile:", err);
    }
  };

  const fetchHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*, transaction_items(*)')
        .order('date', { ascending: false });
        
      if (error) throw error;
      
      // Map the data to match the expected format
      const formattedData = data.map(t => ({
        ...t,
        items: (t.transaction_items || []).map(item => {
          let parsedAddons = [];
          if (typeof item.addons === 'string') {
            try {
              parsedAddons = JSON.parse(item.addons);
            } catch (e) {
              console.error("Error parsing addons:", e);
            }
          } else {
            parsedAddons = item.addons || [];
          }
          return {
            ...item,
            addons: parsedAddons
          };
        })
      }));
      
      setTransactions(formattedData);
    } catch (err) {
      console.error("Error fetching history:", err);
    }
  };
  const handleReprint = async (transaction) => {
    const txDataConfig = {
      invoice_no: transaction.invoice_no || transaction.transaction_id,
      date: moment.utc(transaction.date).tz(TIMEZONE).format("YYYY-MM-DD HH:mm:ss"),
      customer_name: transaction.customer_name,
      table_no: transaction.table_no,
      payment_method: transaction.payment_method,
      cash_amount: transaction.cash_amount,
      change_amount: transaction.change_amount
    };
    const totals = {
      subtotal: transaction.subtotal,
      tax: transaction.tax,
      discount: transaction.discount,
      total: transaction.total_price
    };
    
    const receiptText = formatReceiptText(storeProfile, txDataConfig, transaction.items, totals);
    
    try {
      await printViaBluetooth(receiptText);
      alert("Receipt printed successfully!");
    } catch (err) {
      console.error("Bluetooth print failed:", err);
      alert("Bluetooth print failed or was cancelled.");
    }
  };

  const initiateDelete = (transaction, e) => {
    e.stopPropagation();
    setTransactionToDelete(transaction);
    setDeletePassword("");
    setDeleteError("");
    setDeleteModalOpen(true);
  };

  const initiateRefund = (transaction, e) => {
    e.stopPropagation();
    setTransactionToRefund(transaction);
    setRefundType("Refund");
    setRefundReason("");
    setRefundPassword("");
    setRefundError("");
    setRefundModalOpen(true);
  };

  const confirmRefund = async () => {
    if (!user || user.password !== refundPassword) {
      setRefundError("Invalid password");
      return;
    }
    if (!refundReason.trim()) {
      setRefundError("Reason is required");
      return;
    }
    
    setIsRefunding(true);
    try {
      const { error } = await supabase
        .from('transactions')
        .update({ 
          status: refundType.toUpperCase(),
          notes: refundReason
        })
        .eq('transaction_id', transactionToRefund.transaction_id);
        
      if (error) throw error;
      
      setTransactions(prev => prev.map(t => 
        t.transaction_id === transactionToRefund.transaction_id 
          ? { ...t, status: refundType.toUpperCase(), notes: refundReason } 
          : t
      ));
      
      setRefundModalOpen(false);
      setTransactionToRefund(null);
    } catch (err) {
      console.error("Error refunding/voiding transaction:", err);
      setRefundError(err.message || "Failed to process request.");
    } finally {
      setIsRefunding(false);
    }
  };

  const confirmDelete = async () => {
    if (!user || user.password !== deletePassword) {
      setDeleteError("Invalid password");
      return;
    }
    
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('transaction_id', transactionToDelete.transaction_id);
        
      if (error) throw error;
      
      setTransactions(prev => prev.filter(t => t.transaction_id !== transactionToDelete.transaction_id));
      setDeleteModalOpen(false);
      setTransactionToDelete(null);
    } catch (err) {
      console.error("Error deleting transaction:", err);
      setDeleteError("Failed to delete transaction.");
    } finally {
      setIsDeleting(false);
    }
  };

  const transactionsWithInvoice = React.useMemo(() => {
    // Group all transactions by local date string
    const groups = {};
    const sorted = [...transactions].sort((a,b) => a.transaction_id - b.transaction_id);
    sorted.forEach(t => {
      const gDate = moment.utc(t.date).tz(TIMEZONE).format('YYYY-MM-DD');
      if (!groups[gDate]) groups[gDate] = [];
      groups[gDate].push(t);
    });
    
    // Map with calculated invoice number
    return transactions.map(t => {
      const gDate = moment.utc(t.date).tz(TIMEZONE).format('YYYY-MM-DD');
      const index = (groups[gDate] || []).findIndex(x => x.transaction_id === t.transaction_id);
      const datePart = moment.utc(t.date).tz(TIMEZONE).format('YYMMDD');
      const seqPart = String(Math.max(0, index) + 1).padStart(3, '0');
      return { ...t, invoice_no: `${datePart}${seqPart}` };
    });
  }, [transactions]);

  useEffect(() => {
    setPage(1);
  }, [search, startDate, endDate]);

  const filteredTransactions = transactionsWithInvoice.filter((t) => {
    const matchSearch = String(t.customer_name || "").toLowerCase().includes(search.toLowerCase()) || String(t.invoice_no || "").includes(search);
    const localDate = moment.utc(t.date).tz(TIMEZONE).format("YYYY-MM-DD");
    
    let matchDate = true;
    if (startDate) {
      matchDate = matchDate && localDate >= startDate;
    }
    if (endDate) {
      matchDate = matchDate && localDate <= endDate;
    }
    return matchSearch && matchDate;
  });

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const paginatedTransactions = filteredTransactions.slice((page - 1) * itemsPerPage, page * itemsPerPage);
  return <div className="p-8 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">Transaction History</h1>
        <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4 w-full md:w-auto">
          <div className="flex space-x-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-40">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
      type="date"
      value={startDate}
      onChange={(e) => setStartDate(e.target.value)}
      className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
    />
            </div>
            <div className="flex items-center text-gray-500">-</div>
            <div className="relative flex-1 sm:w-40">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
      type="date"
      value={endDate}
      onChange={(e) => setEndDate(e.target.value)}
      className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
    />
            </div>
          </div>
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
    type="text"
    placeholder="Search by name or ID..."
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none sm:w-64"
  />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              <th className="p-4 font-bold text-gray-600 dark:text-gray-300">ID</th>
              <th className="p-4 font-bold text-gray-600 dark:text-gray-300">Date</th>
              <th className="p-4 font-bold text-gray-600 dark:text-gray-300">Account</th>
              <th className="p-4 font-bold text-gray-600 dark:text-gray-300">Customer</th>
              <th className="p-4 font-bold text-gray-600 dark:text-gray-300">Table</th>
              <th className="p-4 font-bold text-gray-600 dark:text-gray-300">Total</th>
              <th className="p-4 font-bold text-gray-600 dark:text-gray-300">Payment</th>
              <th className="p-4 font-bold text-gray-600 dark:text-gray-300 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedTransactions.map((t) => <React.Fragment key={t.transaction_id}>
                <tr className="border-b border-gray-100 hover:bg-gray-50 dark:bg-gray-900 transition-colors cursor-pointer" onClick={() => setExpandedId(expandedId === t.transaction_id ? null : t.transaction_id)}>
                  <td className="p-4 font-medium text-gray-800 dark:text-gray-100">
                    <div className="flex items-center space-x-2">
                      {expandedId === t.transaction_id ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                      <span>#{t.invoice_no}</span>
                    </div>
                  </td>
                  <td className="p-4 text-gray-600 dark:text-gray-300">
                    {moment.utc(t.date).tz(TIMEZONE).format("YYYY-MM-DD HH:mm:ss")}
                  </td>
                  <td className="p-4 text-gray-600 dark:text-gray-300">
                    {t.cashier_name || "-"}
                  </td>
                  <td className="p-4 font-medium text-gray-800 dark:text-gray-100">{t.customer_name}</td>
                  <td className="p-4 text-gray-600 dark:text-gray-300">{t.table_no}</td>
                  <td className="p-4 font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">Rp {Number(t.total_price || 0).toLocaleString("id-ID")}</td>
                  <td className="p-4 max-w-[200px]">
                    <span className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-medium inline-block break-words w-full">
                      {t.payment_method}
                    </span>
                    {t.status && (t.status === 'REFUND' || t.status === 'VOID') && (
                      <span className="mt-2 px-2 py-1 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded text-xs font-bold block w-fit">
                        {t.status}
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReprint(t);
                        }}
                        className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:bg-blue-900/30 rounded-lg transition-colors inline-flex items-center"
                        title="Reprint Receipt"
                      >
                        <Printer size={20} />
                      </button>
                      {isAdmin && (
                        <>
                          <button
                            onClick={(e) => initiateRefund(t, e)}
                            className="p-2 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:bg-orange-900/30 rounded-lg transition-colors inline-flex items-center"
                            title="Refund / Void"
                          >
                            <RefreshCcw size={20} />
                          </button>
                          <button
                            onClick={(e) => initiateDelete(t, e)}
                            className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:bg-red-900/30 rounded-lg transition-colors inline-flex items-center"
                            title="Delete Transaction"
                          >
                            <Trash2 size={20} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
                {expandedId === t.transaction_id && <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-100">
                    <td colSpan={8} className="p-6">
                      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
                        <div className="flex justify-between items-center mb-4 border-b pb-2 border-gray-200 dark:border-gray-700">
                          <h4 className="font-semibold text-gray-800 dark:text-gray-100">Order Details</h4>
                          {t.status && (t.status === 'REFUND' || t.status === 'VOID') && t.notes && (
                            <div className="text-sm px-3 py-1 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-lg">
                              <strong>Reason:</strong> {t.notes}
                            </div>
                          )}
                        </div>                        <div className="space-y-3">
                          {t.items.map((item, idx) => <div key={idx} className="flex justify-between items-start">
                              <div>
                                <p className="font-medium text-gray-800 dark:text-gray-100">
                                  {item.qty}x {item.menu_name}
                                  {item.is_auto_free ? <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">FREE</span> : ""}
                                </p>
                                {(item.drink_type || item.sugar_level) && <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {item.drink_type && <span>{item.drink_type}</span>}
                                    {item.drink_type && item.sugar_level && <span> • </span>}
                                    {item.sugar_level && <span>{item.sugar_level} Sugar</span>}
                                  </p>}
                                {Array.isArray(item.addons) && item.addons.length > 0 && <p className="text-sm text-gray-500 dark:text-gray-400">
                                    + {item.addons.map((a) => a.name).join(", ")}
                                  </p>}
                              </div>
                              <p className="font-medium text-gray-800 dark:text-gray-100">Rp {Number(item.subtotal || 0).toLocaleString("id-ID")}</p>
                            </div>)}
                        </div>
                        <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end space-x-8 text-sm">
                          <div className="text-right">
                            <p className="text-gray-500 dark:text-gray-400 mb-1">Subtotal</p>
                            <p className="font-medium text-gray-800 dark:text-gray-100">Rp {Number(t.subtotal || 0).toLocaleString("id-ID")}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-gray-500 dark:text-gray-400 mb-1">Tax</p>
                            <p className="font-medium text-gray-800 dark:text-gray-100">Rp {Number(t.tax || 0).toLocaleString("id-ID")}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-gray-500 dark:text-gray-400 mb-1">Discount</p>
                            <p className="font-medium text-red-600">-Rp {Number(t.discount || 0).toLocaleString("id-ID")}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-gray-500 dark:text-gray-400 mb-1">Total</p>
                            <p className="font-bold text-blue-600 dark:text-blue-400 text-lg">Rp {Number(t.total_price || 0).toLocaleString("id-ID")}</p>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>}
              </React.Fragment>)}
            {paginatedTransactions.length === 0 && <tr>
                <td colSpan={7} className="p-8 text-center text-gray-500 dark:text-gray-400">
                  No transactions found.
                </td>
              </tr>}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-700">
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Showing {(page - 1) * itemsPerPage + 1} to {Math.min(page * itemsPerPage, filteredTransactions.length)} of {filteredTransactions.length} entries
            </span>
            <div className="flex space-x-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {deleteModalOpen && transactionToDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 dark:bg-gray-900">
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Delete Transaction</h3>
              <button onClick={() => setDeleteModalOpen(false)} className="p-2 hover:bg-gray-200 dark:bg-gray-600 rounded-full text-gray-500 dark:text-gray-400 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                Are you sure you want to delete transaction <strong>#{transactionToDelete.invoice_no}</strong>? This action cannot be undone.
              </p>
              
              {deleteError && <div className="bg-red-50 text-red-600 p-3 rounded-xl mb-4 text-sm">{deleteError}</div>}
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Please enter your password to confirm</label>
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-red-500 outline-none transition-all"
                    placeholder="Enter password"
                  />
                </div>
                
                <div className="flex space-x-3 pt-2">
                  <button
                    onClick={() => setDeleteModalOpen(false)}
                    className="flex-1 py-3 px-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDelete}
                    disabled={isDeleting || !deletePassword}
                    className="flex-1 py-3 px-4 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDeleting ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {refundModalOpen && transactionToRefund && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 dark:bg-gray-900">
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Refund / Void Transaction</h3>
              <button onClick={() => setRefundModalOpen(false)} className="p-2 hover:bg-gray-200 dark:bg-gray-600 rounded-full text-gray-500 dark:text-gray-400 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                Process Refund/Void for transaction <strong>#{transactionToRefund.invoice_no}</strong>.
              </p>
              
              {refundError && <div className="bg-red-50 text-red-600 p-3 rounded-xl mb-4 text-sm">{refundError}</div>}
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Type</label>
                  <select
                    value={refundType}
                    onChange={(e) => setRefundType(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                  >
                    <option value="Refund">Refund</option>
                    <option value="Void">Void</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Reason</label>
                  <input
                    type="text"
                    maxLength={100}
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                    placeholder="Enter reason (max 100 characters)"
                  />
                  <div className="text-right text-xs text-gray-500 mt-1">{refundReason.length}/100</div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Password to confirm</label>
                  <input
                    type="password"
                    value={refundPassword}
                    onChange={(e) => setRefundPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                    placeholder="Enter password"
                  />
                </div>
                
                <div className="flex space-x-3 pt-2">
                  <button
                    onClick={() => setRefundModalOpen(false)}
                    className="flex-1 py-3 px-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmRefund}
                    disabled={isRefunding || !refundPassword || !refundReason.trim()}
                    className="flex-1 py-3 px-4 bg-orange-600 text-white font-bold rounded-xl hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isRefunding ? "Processing..." : "Confirm"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>;
}
export {
  History as default
};
