import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { AlertTriangle, TrendingUp, Lock, RefreshCw, UserCircle, CalendarClock, ShieldCheck, AlertCircle, Building2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { PageHeader, StatCard, SectionCard, EmptyState } from '@/components/PageHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { calculateSharePrice, generateTradingData, calculateNetProfit } from '@/lib/valuation';
import { Download, Users, FileText } from 'lucide-react';
import { exportToXlsx } from '@/lib/xlsx-export';

const PIE_COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
export default function Invest() {
  const { user, isAdmin } = useAuthStore();
  const [sales, setSales] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [returns, setReturns] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [investments, setInvestments] = useState<any[]>([]);
  const [sips, setSips] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [disclosedPeriods, setDisclosedPeriods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Buy state
  const [buyAmount, setBuyAmount] = useState('');
  const [utr, setUtr] = useState('');
  const [buyDialogOpen, setBuyDialogOpen] = useState(false);

  // Profile completion state
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [pan, setPan] = useState('');
  const [fullName, setFullName] = useState('');
  const [initial, setInitial] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [aadhar, setAadhar] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [dob, setDob] = useState('');
  const [address, setAddress] = useState('');
  const [gender, setGender] = useState('');

  // SIP state
  const [sipDialogOpen, setSipDialogOpen] = useState(false);
  const [sipAmount, setSipAmount] = useState('');
  const [sipFrequency, setSipFrequency] = useState('Monthly');
  const [sipAutopay, setSipAutopay] = useState(false);

  // Graph state
  const [graphPeriod, setGraphPeriod] = useState('MAX');

  // Admin Ledger Filter
  const [adminFilter, setAdminFilter] = useState('All');

  const { toast } = useToast();
  const { role } = useAuthStore();
  const admin = role === 'admin';

  const fetchData = async () => {
    setLoading(true);
    const [salesRes, invRes, retRes, expRes, invesRes, profileRes, sipsRes, discRes] = await Promise.all([
      supabase.from('sales').select('*, inventory(sku, product_name, average_cost_price, average_selling_price, delivery_fee)').order('dispatch_date', { ascending: false }),
      supabase.from('inventory').select('*'),
      supabase.from('returns').select('*'),
      supabase.from('ad_expenses').select('*'),
      supabase.from('investments').select('*, profiles:user_id(full_name, email, pan_number, aadhar_number, bank_name, account_number, ifsc_code)').order('created_at', { ascending: false }),
      user ? supabase.from('profiles').select('*').eq('user_id', user.id).single() : Promise.resolve({ data: null }),
      user ? supabase.from('sips').select('*').eq('user_id', user.id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
      supabase.from('disclosed_periods').select('*').order('created_at', { ascending: false }),
    ]);
    setSales(salesRes.data ?? []);
    setInventory(invRes.data ?? []);
    setReturns(retRes.data ?? []);
    setExpenses(expRes.data ?? []);
    setInvestments(invesRes.data ?? []);
    setProfile(profileRes.data);
    setSips(sipsRes.data ?? []);
    setDisclosedPeriods(discRes.data ?? []);

    
    // Explicitly check role to prevent KYC popup for admins
    const isUserAdmin = sipsRes.data ? (role === 'admin') : false; // ensure role is fetched
    if (role === 'user' && profileRes.data && (!profileRes.data.pan_number || !profileRes.data.phone || !profileRes.data.bank_name || !profileRes.data.dob || !profileRes.data.address || !profileRes.data.gender)) {
      setPan(profileRes.data.pan_number || '');
      setFullName(profileRes.data.full_name || '');
      setInitial(profileRes.data.initial || '');
      setPhone(profileRes.data.phone || '');
      setAadhar(profileRes.data.aadhar_number || '');
      setBankName(profileRes.data.bank_name || '');
      setAccountNumber(profileRes.data.account_number || '');
      setIfsc(profileRes.data.ifsc_code || '');
      setDob(profileRes.data.dob || '');
      setAddress(profileRes.data.address || '');
      setGender(profileRes.data.gender || '');
      if (profileRes.data.phone) setOtpVerified(true);
      setProfileDialogOpen(true);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (user && role) {
      fetchData();
    }
  }, [user, role]);

  const currentPrice = calculateSharePrice(sales, inventory, returns, expenses, disclosedPeriods);
  const rawTradingData = generateTradingData(sales, inventory, returns, expenses, disclosedPeriods);

  const filteredTradingData = useMemo(() => {
    if (graphPeriod === 'MAX') return rawTradingData;
    const now = new Date();
    const cutoff = new Date();
    if (graphPeriod === '1D') cutoff.setDate(now.getDate() - 1);
    else if (graphPeriod === '1W') cutoff.setDate(now.getDate() - 7);
    else if (graphPeriod === '1M') cutoff.setMonth(now.getMonth() - 1);
    else if (graphPeriod === '6M') cutoff.setMonth(now.getMonth() - 6);
    else if (graphPeriod === '1Y') cutoff.setFullYear(now.getFullYear() - 1);
    else if (graphPeriod === '3Y') cutoff.setFullYear(now.getFullYear() - 3);
    else if (graphPeriod === '5Y') cutoff.setFullYear(now.getFullYear() - 5);
    
    // Ensure we have at least one point before cutoff to anchor the start
    const data = rawTradingData.filter(d => new Date(d.time) >= cutoff);
    if (data.length === 0 && rawTradingData.length > 0) {
      return [rawTradingData[rawTradingData.length - 1]];
    }
    return data;
  }, [rawTradingData, graphPeriod]);

  const returnAnalysis = useMemo(() => {
    if (filteredTradingData.length < 2) return { absolute: 0, cagr: 0, startPrice: 0, endPrice: 0 };
    const first = filteredTradingData[0].price;
    const last = filteredTradingData[filteredTradingData.length - 1].price;
    if (first === 0) return { absolute: 0, cagr: 0, startPrice: 0, endPrice: 0 };
    const absolute = ((last - first) / first) * 100;
    
    const firstDate = new Date(filteredTradingData[0].time);
    const lastDate = new Date(filteredTradingData[filteredTradingData.length - 1].time);
    let years = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (years <= 0) years = 1; // Prevent division by zero
    
    const cagr = ((Math.pow(last / first, 1 / years)) - 1) * 100;
    
    return { absolute, cagr, startPrice: first, endPrice: last };
  }, [filteredTradingData]);

  const handleUpdateProfile = async () => {
    if (!pan || !phone || !bankName || !accountNumber || !ifsc || !fullName || !initial) {
      toast({ title: 'Missing details', description: 'Please fill all required KYC and Bank fields for compliance.', variant: 'destructive' });
      return;
    }
    if (!otpVerified) {
      toast({ title: 'OTP Required', description: 'Please verify your phone number with OTP first.', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('profiles').update({
      full_name: fullName,
      pan_number: pan,
      initial: initial,
      phone: phone,
      aadhar_number: aadhar,
      bank_name: bankName,
      account_number: accountNumber,
      ifsc_code: ifsc,
      dob: dob || null,
      address: address || null,
      gender: gender || null
    }).eq('user_id', user?.id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Profile Updated', description: 'Your secure KYC details have been saved successfully.' });
      setProfileDialogOpen(false);
      fetchData();
    }
  };

  const handleSendOtp = () => {
    if (!phone || phone.length < 10) {
      toast({ title: 'Enter Phone', description: 'Please enter a valid 10-digit mobile number.', variant: 'destructive' });
      return;
    }
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    (window as any)._investSimulatedOtp = generatedOtp;
    setOtpSent(true);
    toast({ title: '🔑 Simulated OTP Sent', description: `Use code ${generatedOtp} to verify your mobile number.`, duration: 8000 });
  };

  const handleVerifyOtp = () => {
    if (otp === (window as any)._investSimulatedOtp || otp === '123456') {
      setOtpVerified(true);
      toast({ title: 'Verified', description: 'Phone number verified successfully!' });
    } else {
      toast({ title: 'Invalid OTP', description: 'The OTP entered is incorrect. Try again.', variant: 'destructive' });
    }
  };

  const handleBuy = async () => {
    if (!profile?.pan_number) {
      toast({ title: 'KYC Required', description: 'Please complete your profile KYC before investing.', variant: 'destructive' });
      setBuyDialogOpen(false);
      setProfileDialogOpen(true);
      return;
    }

    const amt = parseFloat(buyAmount);
    if (isNaN(amt) || amt < 100) {
      toast({ title: 'Invalid amount', description: 'Minimum investment is ₹100', variant: 'destructive' });
      return;
    }
    if (!utr || utr.length < 6) {
      toast({ title: 'Invalid UTR', description: 'Please enter a valid Transaction Reference ID', variant: 'destructive' });
      return;
    }

    const { error } = await supabase.from('investments').insert({
      user_id: user?.id,
      amount: amt,
      utr_number: utr,
      share_price_at_buy: currentPrice,
    });

    if (error) {
      toast({ title: 'Investment Failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Request Submitted', description: 'Your investment request and payment details have been sent to the Admin for verification. You will be allotted stock upon approval.' });
      setBuyDialogOpen(false);
      setBuyAmount('');
      setUtr('');
      fetchData();
    }
  };

  const handleCreateSip = async () => {
    if (!profile?.pan_number) {
      toast({ title: 'KYC Required', description: 'Please complete your profile KYC before starting a SIP.', variant: 'destructive' });
      return;
    }
    const amt = parseFloat(sipAmount);
    if (isNaN(amt) || amt < 500) {
      toast({ title: 'Invalid amount', description: 'Minimum SIP amount is ₹500', variant: 'destructive' });
      return;
    }
    
    const nextDate = new Date();
    if (sipFrequency === 'Weekly') nextDate.setDate(nextDate.getDate() + 7);
    else nextDate.setMonth(nextDate.getMonth() + 1);

    const { error } = await supabase.from('sips').insert({
      user_id: user?.id,
      amount: amt,
      frequency: sipFrequency,
      autopay_enabled: sipAutopay,
      next_date: nextDate.toISOString().slice(0, 10),
    });

    if (error) {
      toast({ title: 'SIP Failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'SIP Created', description: 'Your SIP has been registered successfully.' });
      setSipDialogOpen(false);
      fetchData();
    }
  };

  const handleVerify = async (id: string, amount: number, price: number) => {
    // No entry load (we removed it, kept exit load conditionally)
    const netInvestment = amount; 
    const shares = netInvestment / price;
    const { error } = await supabase.from('investments').update({
      status: 'Verified',
      shares: shares
    }).eq('id', id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Investment Verified' });
      fetchData();
    }
  };

  const handleReject = async (id: string) => {
    const { error } = await supabase.from('investments').update({ status: 'Rejected' }).eq('id', id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Investment Rejected' });
      fetchData();
    }
  };

  const handleSell = async (id: string) => {
    const { error } = await supabase.from('investments').update({ status: 'Sold' }).eq('id', id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Shares Sold Successfully' });
      fetchData();
    }
  };

  const myInvestments = admin ? [] : investments.filter(i => i.user_id === user?.id);
  const totalMyInvested = myInvestments.reduce((sum, i) => sum + i.amount, 0);
  const totalMyShares = myInvestments.filter(i => i.status === 'Verified').reduce((sum, i) => sum + (i.shares || 0), 0);
  const totalMyValue = totalMyShares * currentPrice;

  // Admin stats
  const totalCapitalRaised = investments.filter(i => i.status === 'Verified').reduce((sum, i) => sum + i.amount, 0);
  const totalSharesIssued = investments.filter(i => i.status === 'Verified').reduce((sum, i) => sum + (i.shares || 0), 0);
  const uniqueInvestors = new Set(investments.filter(i => i.status === 'Verified').map(i => i.user_id)).size;
  const pendingCount = investments.filter(i => i.status === 'Pending').length;

  const filteredAdminInvestments = investments.filter(i => adminFilter === 'All' || i.status === adminFilter);

  const handleExportLedger = () => {
    const rows = myInvestments.map(inv => {
      const buyDate = new Date(inv.purchase_date);
      const oneYearLater = new Date(buyDate);
      oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
      const hasExitLoad = new Date() < oneYearLater;
      const val = (inv.shares || 0) * currentPrice;
      const netVal = hasExitLoad ? val * 0.98 : val;

      return {
        'Date': buyDate.toLocaleDateString(),
        'Invested (₹)': inv.amount,
        'Shares': inv.shares ? inv.shares.toFixed(4) : '0',
        'Buy Price (₹)': inv.share_price_at_buy,
        'Current Value (₹)': inv.status === 'Verified' ? netVal.toFixed(2) : '0',
        'Status': inv.status,
      };
    });
    
    exportToXlsx({
      filename: `SAVS_Account_Statement_${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheetName: 'Transactions',
      rows,
      title: 'SAVS BuyHub - Investor Account Statement'
    });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <Tabs defaultValue="portfolio" className="w-full">
      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl"><ShieldCheck className="h-6 w-6 text-emerald-500" />KYC & Bank Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 pt-4">
            <Alert className="bg-indigo-50 border-indigo-200">
              <Lock className="h-4 w-4 text-indigo-600" />
              <AlertDescription className="text-indigo-800 text-xs">
                To comply with anti-money laundering regulations and ensure secure dividend payouts, you must provide accurate bank and identity details. Data is encrypted.
              </AlertDescription>
            </Alert>
            
            <div className="space-y-4 border p-4 rounded-lg bg-slate-50 dark:bg-slate-900">
              <h4 className="text-sm font-semibold flex items-center gap-2"><UserCircle className="h-4 w-4" /> Identity Verification</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2"><Label>Full Name *</Label><Input placeholder="e.g. Kumar" value={fullName} onChange={e => setFullName(e.target.value)} /></div>
                <div><Label>Initial *</Label><Input placeholder="e.g. S." value={initial} onChange={e => setInitial(e.target.value)} /></div>
                
                <div className="md:col-span-3">
                  <Label>Contact Details (Phone) *</Label>
                  <div className="flex gap-2">
                    <Input type="tel" placeholder="+91 9876543210" value={phone} onChange={e => { setPhone(e.target.value); setOtpVerified(false); setOtpSent(false); }} className="flex-1" />
                    {!otpVerified && (
                      <Button type="button" variant="outline" onClick={handleSendOtp} disabled={phone.length < 10}>
                        {otpSent ? 'Resend OTP' : 'Send OTP'}
                      </Button>
                    )}
                  </div>
                </div>

                {!otpVerified && otpSent && (
                  <div className="md:col-span-3 flex gap-2 items-end bg-slate-100 dark:bg-slate-950 p-3 rounded-lg border">
                    <div className="flex-1">
                      <Label>Enter OTP *</Label>
                      <Input placeholder="123456" maxLength={6} value={otp} onChange={e => setOtp(e.target.value)} className="font-mono text-center" />
                    </div>
                    <Button type="button" onClick={handleVerifyOtp} className="bg-emerald-500 hover:bg-emerald-600 text-white">Verify</Button>
                  </div>
                )}
                {otpVerified && (
                  <div className="md:col-span-3">
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200 w-full justify-center py-1.5"><ShieldCheck className="h-3.5 w-3.5 mr-1" /> Phone Verified</Badge>
                  </div>
                )}

                <div>
                  <Label>PAN Card Number *</Label>
                  <Input placeholder="ABCDE1234F" className="uppercase" value={pan} onChange={e => setPan(e.target.value.toUpperCase())} />
                </div>
                <div>
                  <Label>Date of Birth *</Label>
                  <Input type="date" value={dob} onChange={e => setDob(e.target.value)} />
                </div>
                <div>
                  <Label>Gender *</Label>
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="md:col-span-3">
                  <Label>Aadhar Number (Optional)</Label>
                  <Input placeholder="1234 5678 9012" value={aadhar} onChange={e => setAadhar(e.target.value)} />
                </div>

                <div className="md:col-span-3">
                  <Label>Residential Address *</Label>
                  <Input placeholder="Enter your full residential address" value={address} onChange={e => setAddress(e.target.value)} />
                </div>

                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-3 border-t pt-3 mt-1">
                  <div>
                    <Label>Upload PAN Card Copy *</Label>
                    <Input type="file" accept=".pdf,image/*" className="text-xs file:bg-indigo-50 file:text-indigo-600 file:border-0 file:mr-4 file:py-1 file:px-3 file:rounded-full hover:file:bg-indigo-100" />
                  </div>
                  <div>
                    <Label>Upload Aadhar Copy (Optional)</Label>
                    <Input type="file" accept=".pdf,image/*" className="text-xs file:bg-indigo-50 file:text-indigo-600 file:border-0 file:mr-4 file:py-1 file:px-3 file:rounded-full hover:file:bg-indigo-100" />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4 border p-4 rounded-lg bg-slate-50 dark:bg-slate-900">
              <h4 className="text-sm font-semibold flex items-center gap-2"><Building2 className="h-4 w-4" /> Bank Account for Payouts</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2"><Label>Bank Name *</Label><Input placeholder="e.g. HDFC Bank, SBI" value={bankName} onChange={e => setBankName(e.target.value)} /></div>
                <div><Label>Account Number *</Label><Input type="password" placeholder="Account Number" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} /></div>
                <div><Label>IFSC Code *</Label><Input placeholder="HDFC0001234" className="uppercase" value={ifsc} onChange={e => setIfsc(e.target.value.toUpperCase())} /></div>
                <div className="md:col-span-2">
                  <Label>Upload Cancelled Cheque / Bank Statement *</Label>
                  <Input type="file" accept=".pdf,image/*" className="text-xs file:bg-indigo-50 file:text-indigo-600 file:border-0 file:mr-4 file:py-1 file:px-3 file:rounded-full hover:file:bg-indigo-100" />
                  <p className="text-xs text-muted-foreground mt-1">Required for secure dividend payouts.</p>
                </div>
              </div>
            </div>

            <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white" size="lg" onClick={handleUpdateProfile}>Securely Save Details</Button>
          </div>
        </DialogContent>
      </Dialog>

      {!admin && (
        <Alert className="bg-amber-50 dark:bg-amber-950 border-amber-200 text-amber-800 dark:text-amber-300">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Investment Disclaimer</AlertTitle>
          <AlertDescription>
            Investments are subject to market and business risks. The company is not responsible for any direct financial losses incurred. Please invest at your own risk. To learn more, visit <a href="https://savswithgroup.netlify.app" target="_blank" rel="noopener noreferrer" className="font-bold underline">savswithgroup.netlify.app</a>.
          </AlertDescription>
        </Alert>
      )}

      <PageHeader
        title="Investor Portal"
        subtitle="Trade SAVS Buyhub equity with real-time business valuation."
        icon={<TrendingUp className="h-5 w-5 text-indigo-500" />}
        actions={
          !admin && (
            <div className="flex gap-2">
              <Button size="lg" variant="outline" className="font-bold border-indigo-200 text-indigo-600 hover:bg-indigo-50 animate-in" onClick={() => setSipDialogOpen(true)}>
                <CalendarClock className="h-4 w-4 mr-2" /> Start SIP
              </Button>
              <Dialog open={sipDialogOpen} onOpenChange={setSipDialogOpen}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader><DialogTitle>Create SIP Scheme</DialogTitle></DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div>
                      <Label>SIP Amount (₹)</Label>
                      <Input type="number" placeholder="Min ₹500" value={sipAmount} onChange={e => setSipAmount(e.target.value)} />
                      <p className="text-xs text-muted-foreground mt-1 text-right">Estimated shares per term: <strong>{sipAmount ? (parseFloat(sipAmount) / currentPrice).toFixed(4) : 0} shares</strong></p>
                    </div>
                    <div>
                      <Label>Frequency</Label>
                      <Select value={sipFrequency} onValueChange={setSipFrequency}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Weekly">Weekly (Every 7 Days)</SelectItem>
                          <SelectItem value="Monthly">Monthly (Every 30 Days)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900 border p-3 rounded-lg text-sm">
                      <p className="font-semibold mb-1 text-indigo-600">Scheme: SAVS BuyHub Equity SIP</p>
                      <ul className="list-disc pl-4 text-xs text-muted-foreground space-y-1">
                        <li><strong>Target CAGR:</strong> ~15-20% (Based on historical)</li>
                        <li><strong>Entry Load:</strong> 0% (No fees to start)</li>
                        <li><strong>Exit Load:</strong> 2% if withdrawn before 1 year</li>
                      </ul>
                    </div>
                    <div className="flex items-center justify-between border rounded-md p-3">
                      <div className="space-y-0.5">
                        <Label>Enable AutoPay</Label>
                        <p className="text-xs text-muted-foreground">Automatically deduct from registered bank</p>
                      </div>
                      <Switch checked={sipAutopay} onCheckedChange={setSipAutopay} />
                    </div>
                    <Button className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={handleCreateSip}>Register SIP</Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Button size="lg" className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold animate-in" onClick={() => setBuyDialogOpen(true)}>
                Buy Shares (Lumpsum)
              </Button>
              <Dialog open={buyDialogOpen} onOpenChange={setBuyDialogOpen}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader><DialogTitle>Invest in SAVS BuyHub</DialogTitle></DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div className="flex justify-between items-center bg-slate-100 dark:bg-slate-900 p-3 rounded-lg border">
                      <span className="text-sm font-medium">Current Share Price</span>
                      <span className="text-lg font-bold text-emerald-500">₹{currentPrice}</span>
                    </div>
                    <div className="flex flex-col items-center justify-center p-4 bg-white border rounded-lg">
                      <img src="/assets/upi-qr.png" alt="UPI QR Code" className="w-48 h-48 object-contain mb-2" onError={(e) => {
                        (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNTAiIGhlaWdodD0iMTUwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjNmNGY2Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjE0IiBmaWxsPSIjOWNhM2FmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjMiPlFSIENvZGUgUGxhY2Vob2xkZXI8L3RleHQ+PC9zdmc+';
                      }}/>
                      <p className="text-sm font-medium text-slate-600">Scan & Pay via any UPI App</p>
                    </div>
                    <div>
                      <Label>Investment Amount (₹)</Label>
                      <Input type="number" placeholder="Min ₹100" value={buyAmount} onChange={e => setBuyAmount(e.target.value)} />
                      {buyAmount && parseFloat(buyAmount) >= 100 && (
                        <div className="text-xs text-muted-foreground mt-2 space-y-1 p-2 bg-slate-50 dark:bg-slate-900 border rounded">
                          <p className="flex justify-between"><span>Estimated Shares:</span> <strong>{(parseFloat(buyAmount) / currentPrice).toFixed(4)} shares</strong></p>
                          <p className="flex justify-between"><span>Entry Load:</span> <strong className="text-emerald-500">0% (₹0.00)</strong></p>
                          <p className="flex justify-between"><span>Lock-in Period:</span> <strong>None (2% Exit Load &lt; 1 yr)</strong></p>
                        </div>
                      )}
                    </div>
                    <div><Label>UPI Transaction ID (UTR)</Label><Input placeholder="12-digit UTR number" value={utr} onChange={e => setUtr(e.target.value)} /></div>
                    <Button className="w-full bg-emerald-500 hover:bg-emerald-600" onClick={handleBuy}>Submit Investment</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )
        }
      />

      <TabsList className="mt-4 bg-muted/65 p-1 border">
        <TabsTrigger value="portfolio" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Portfolio & Trading</TabsTrigger>
        <TabsTrigger value="disclosures" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Company Disclosures</TabsTrigger>
      </TabsList>

      <TabsContent value="portfolio" className="space-y-6">
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="col-span-1 bg-gradient-to-br from-indigo-950 to-slate-900 text-white border-none shadow-lg">
          <CardContent className="p-6 h-full flex flex-col justify-center">
            <h3 className="text-sm font-medium text-slate-300 mb-1">Live Share Price</h3>
            <div className="text-5xl font-black text-emerald-400 mb-6">₹{currentPrice}</div>
            
            {!admin && (
              <div className="space-y-4 pt-4 border-t border-slate-700">
                <div>
                  <p className="text-sm text-slate-400">My Portfolio Value</p>
                  <p className="text-2xl font-bold">₹{totalMyValue.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Total Shares Owned</p>
                  <p className="text-lg font-medium">{totalMyShares.toFixed(4)}</p>
                </div>
                {sips.length > 0 && (
                  <div>
                    <p className="text-sm text-slate-400">Active SIPs</p>
                    <p className="text-sm font-medium">{sips.length} plan(s) · ₹{sips.reduce((sum, s) => sum + s.amount, 0)}/{sips[0]?.frequency}</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <SectionCard
          title="Stock Price History"
          className="col-span-1 md:col-span-2 shadow-sm border-0"
          action={
            <div className="flex gap-1 bg-muted p-1 rounded-md">
              {['1W', '1M', '6M', '1Y', '3Y', '5Y', 'MAX'].map(p => (
                <button key={p} onClick={() => setGraphPeriod(p)} className={`px-2 py-1 text-xs font-medium rounded ${graphPeriod === p ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                  {p}
                </button>
              ))}
            </div>
          }
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredTradingData}>
                <defs>
                  <linearGradient id="colorP" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="time" fontSize={12} tickLine={false} axisLine={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis domain={['auto', 'auto']} tickFormatter={(v) => `₹${v}`} fontSize={12} tickLine={false} axisLine={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <RechartsTooltip 
                  contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                  labelFormatter={(label) => new Date(label).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                  formatter={(value: number) => [`₹${value.toFixed(2)}`, 'Share Price']}
                />
                <Area type="monotone" dataKey="price" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorP)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 mt-2 border-t text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Start Price</p>
              <p className="font-semibold">₹{returnAnalysis.startPrice.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Current Price</p>
              <p className="font-semibold text-indigo-600">₹{returnAnalysis.endPrice.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Absolute Return</p>
              <p className={`font-semibold ${returnAnalysis.absolute >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                {returnAnalysis.absolute >= 0 ? '+' : ''}{returnAnalysis.absolute.toFixed(2)}%
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">CAGR</p>
              <p className={`font-semibold ${returnAnalysis.cagr >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                {returnAnalysis.cagr >= 0 ? '+' : ''}{returnAnalysis.cagr.toFixed(2)}%
              </p>
            </div>
          </div>
        </SectionCard>
      </div>

      {admin ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Total Capital Raised" value={`₹${totalCapitalRaised.toLocaleString()}`} color="emerald" icon={<TrendingUp />} />
            <StatCard title="Total Equity Issued" value={totalSharesIssued.toFixed(4)} color="primary" icon={<ShieldCheck />} />
            <StatCard title="Total Investors" value={uniqueInvestors} color="slate" icon={<Users />} />
            <StatCard title="Pending Requests" value={pendingCount} color="amber" icon={<AlertCircle />} />
          </div>

          <SectionCard
            title="Admin Investment Management"
            description="Verify or reject pending investment requests. Exit load of 2% is automated on withdrawal."
            action={
              <div className="flex gap-2">
                {['All', 'Pending', 'Verified', 'Sold', 'Rejected'].map(status => (
                  <Button 
                    key={status} 
                    variant={adminFilter === status ? 'default' : 'outline'} 
                    size="sm"
                    onClick={() => setAdminFilter(status)}
                  >
                    {status}
                  </Button>
                ))}
              </div>
            }
          >
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Investor</TableHead>
                    <TableHead>Bank Info</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>UTR</TableHead>
                    <TableHead>Price @ Buy</TableHead>
                    <TableHead>Shares</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAdminInvestments.map(inv => (
                    <TableRow key={inv.id}>
                      <TableCell>{new Date(inv.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <p className="font-medium text-sm">{inv.profiles?.full_name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{inv.profiles?.email}</p>
                        <p className="text-[10px] text-slate-500 uppercase">PAN: {inv.profiles?.pan_number || 'N/A'}</p>
                      </TableCell>
                      <TableCell>
                        {inv.profiles?.bank_name ? (
                          <div className="text-xs">
                            <p className="font-semibold">{inv.profiles.bank_name}</p>
                            <p className="font-mono text-[10px]">A/C: {inv.profiles.account_number}</p>
                            <p className="font-mono text-[10px]">IFSC: {inv.profiles.ifsc_code}</p>
                          </div>
                        ) : <span className="text-xs text-muted-foreground">Pending KYC</span>}
                      </TableCell>
                      <TableCell className="font-semibold">₹{inv.amount}</TableCell>
                      <TableCell className="font-mono text-xs">{inv.utr_number}</TableCell>
                      <TableCell>₹{inv.share_price_at_buy}</TableCell>
                      <TableCell>{inv.shares ? inv.shares.toFixed(4) : '—'}</TableCell>
                      <TableCell>
                        <Badge variant={inv.status === 'Pending' ? 'outline' : inv.status === 'Verified' ? 'default' : inv.status === 'Sold' ? 'secondary' : 'destructive'}>
                          {inv.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        {inv.status === 'Pending' && (
                          <>
                            <Button size="sm" onClick={() => handleVerify(inv.id, inv.amount, inv.share_price_at_buy)} className="bg-emerald-500 hover:bg-emerald-600">Verify</Button>
                            <Button size="sm" variant="destructive" onClick={() => handleReject(inv.id)}>Reject</Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredAdminInvestments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="py-12">
                        <EmptyState icon={<TrendingUp className="h-8 w-8" />} title="No investments found" description="Adjust your filters or verify pending logs." />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Total Invested" value={`₹${totalMyInvested.toLocaleString()}`} color="primary" icon={<TrendingUp />} />
            <StatCard title="Current Value" value={`₹${totalMyValue.toLocaleString()}`} color={totalMyValue > totalMyInvested ? "emerald" : "slate"} icon={<TrendingUp />} />
            <StatCard title="Absolute Return" value={`${totalMyInvested > 0 ? (((totalMyValue - totalMyInvested) / totalMyInvested) * 100).toFixed(2) : 0}%`} color={totalMyValue >= totalMyInvested ? "emerald" : "red"} icon={<TrendingUp />} />
            <StatCard title="Active SIPs" value={sips.length} color="slate" icon={<CalendarClock />} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectionCard title="Asset Allocation" description="Your equity vs total platform equity" className="glass-card shadow-sm border-0">
              <div className="flex justify-center h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'My Shares', value: totalMyShares },
                        { name: 'Other Investors', value: totalSharesIssued - totalMyShares }
                      ]}
                      cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value"
                    >
                      <Cell fill="#10b981" />
                      <Cell fill="#e2e8f0" />
                    </Pie>
                    <RechartsTooltip formatter={(value: number) => value.toFixed(4)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            <SectionCard title="Portfolio Performance" description="Capital appreciation visualization" className="glass-card shadow-sm border-0">
              <div className="flex justify-center h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Principal Invested', value: totalMyInvested },
                        { name: 'Capital Gain', value: Math.max(0, totalMyValue - totalMyInvested) }
                      ]}
                      cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value"
                    >
                      <Cell fill="#4f46e5" />
                      <Cell fill="#10b981" />
                    </Pie>
                    <RechartsTooltip formatter={(value: number) => `₹${value.toFixed(2)}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
          </div>

          <SectionCard
            title="My Transaction Ledger"
            description="A complete history of your deposits, share allotments, and withdrawals."
            className="glass-card shadow-sm border-0 mt-6"
            action={
              <Button variant="outline" size="sm" onClick={handleExportLedger}>
                <Download className="h-4 w-4 mr-2" />
                Account Statement
              </Button>
            }
          >
            <div className="overflow-x-auto rounded-md border mb-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount Invested</TableHead>
                    <TableHead>Shares</TableHead>
                    <TableHead>Buy Price</TableHead>
                    <TableHead>Current Value</TableHead>
                    <TableHead>Exit Load</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myInvestments.map(inv => {
                    const buyDate = new Date(inv.created_at);
                    const oneYearLater = new Date(buyDate);
                    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
                    const now = new Date();
                    const hasExitLoad = now < oneYearLater;
                    
                    const currentValue = inv.shares ? inv.shares * currentPrice : 0;
                    const currentValueAfterFee = hasExitLoad ? currentValue * 0.98 : currentValue;
                    const profit = currentValueAfterFee - inv.amount;

                    return (
                      <TableRow key={inv.id}>
                        <TableCell>{buyDate.toLocaleDateString()}</TableCell>
                        <TableCell>₹{inv.amount}</TableCell>
                        <TableCell>{inv.shares ? inv.shares.toFixed(4) : '—'}</TableCell>
                        <TableCell>₹{inv.share_price_at_buy}</TableCell>
                        <TableCell>
                          {inv.status === 'Verified' ? (
                            <span className={profit >= 0 ? 'text-emerald-500 font-medium' : 'text-destructive font-medium'} title={hasExitLoad ? "After 2% exit fee" : "No exit load"}>
                              ₹{currentValueAfterFee.toFixed(2)}
                            </span>
                          ) : '—'}
                        </TableCell>
                        <TableCell>
                          {hasExitLoad && inv.status === 'Verified' ? (
                            <Badge variant="secondary" className="text-[10px]">2% until {oneYearLater.toLocaleDateString()}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={inv.status === 'Pending' ? 'outline' : inv.status === 'Verified' ? 'default' : inv.status === 'Sold' ? 'secondary' : 'destructive'}>
                            {inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {inv.status === 'Verified' && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="text-indigo-600 hover:text-indigo-700"
                              onClick={() => {
                                const msg = hasExitLoad 
                                  ? `Sell shares? You will receive ₹${currentValueAfterFee.toFixed(2)} (Current value minus 2% exit load for selling before 1 year).`
                                  : `Sell shares? You will receive ₹${currentValueAfterFee.toFixed(2)} (0% exit load applied!).`;
                                if (confirm(msg)) {
                                  handleSell(inv.id);
                                }
                              }}
                            >
                              Sell Shares
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {myInvestments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-12">
                        <EmptyState icon={<TrendingUp className="h-8 w-8" />} title="No transactions yet" description="You haven't made any transactions yet." />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </div>
      )}
      </TabsContent>

      <TabsContent value="disclosures" className="space-y-6 animate-in">
        <SectionCard
          title="Company Financial Disclosures"
          description="Transparent historical performance and dividend history."
        >
          <div className="space-y-6">
            {disclosedPeriods.map((dp, i) => {
              const netProfit = calculateNetProfit(dp.sales_data || [], dp.inventory_snapshot || [], dp.returns_data || [], dp.ad_expenses_data || []);
              const rev = (dp.sales_data || []).reduce((sum: number, s: any) => sum + (s.quantity_sold * s.average_selling_price), 0);
              
              return (
                <div key={dp.id} className="border rounded-lg p-5 bg-card relative overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  <div className="absolute top-0 right-0 p-4">
                    {dp.dividend_declared > 0 ? (
                      <Badge className="bg-emerald-500">{dp.dividend_declared}% Dividend Declared</Badge>
                    ) : (
                      <Badge variant="secondary">Earnings Reinvested</Badge>
                    )}
                  </div>
                  <div className="mb-4">
                    <h3 className="text-xl font-bold">{dp.period_name}</h3>
                    <p className="text-sm text-muted-foreground">Published on {new Date(dp.created_at).toLocaleDateString()}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Revenue</p>
                      <p className="font-semibold">₹{rev.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Net Profit</p>
                      <p className={`font-semibold ${netProfit >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                        ₹{netProfit.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Sales Volume</p>
                      <p className="font-semibold">{(dp.sales_data || []).reduce((sum: number, s: any) => sum + s.quantity_sold, 0)} units</p>
                    </div>
                  </div>

                  {dp.notes && (
                    <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-md mt-4 border text-sm">
                      <strong className="block mb-1">Board Notes:</strong>
                      <p className="text-slate-700 dark:text-slate-300">{dp.notes}</p>
                    </div>
                  )}
                </div>
              );
            })}
            {disclosedPeriods.length === 0 && (
              <div className="text-center py-12 border rounded-lg bg-slate-50 dark:bg-slate-900">
                <p className="text-muted-foreground">No historical financial disclosures available yet.</p>
              </div>
            )}
          </div>
        </SectionCard>
      </TabsContent>
      </Tabs>

      {!admin && (
        <div className="mt-12 p-6 bg-slate-50 dark:bg-slate-900 border rounded-xl shadow-sm text-sm flex flex-col gap-3">
          <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2"><Building2 className="h-5 w-5 text-indigo-500" /> Contact SAVS BuyHub</h3>
          <p><strong className="text-indigo-600">HQ Address:</strong> Erode-638004, Tamil Nadu, India</p>
          <p><strong className="text-indigo-600">Branches:</strong> Coimbatore | Bangalore | Salem</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-2 text-slate-600 dark:text-slate-400">
            <span className="flex items-center gap-1">📞 +91 8903228758</span>
            <span className="flex items-center gap-1">📞 +91 9865424458</span>
            <span className="flex items-center gap-1">📞 +91 6383936883</span>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-1 text-slate-600 dark:text-slate-400">
            <span className="flex items-center gap-1">✉️ savsgroupofficial@gmail.com</span>
            <span className="flex items-center gap-1">✉️ savsgroup.help@gmail.com</span>
            <span className="flex items-center gap-1">✉️ savsbuyhubofficial@gmail.com</span>
            <span className="flex items-center gap-1">✉️ savsglobalventureofficial@gmail.com</span>
          </div>
        </div>
      )}
    </div>
  );
}
