import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://nuxygngqxgnisqkcxpme.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51eHlnbmdxeGduaXNxa2N4cG1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MzY4MjIsImV4cCI6MjA5MTQxMjgyMn0.tKq3fiBVUmoa0IOcAZM3QhMhSLRc_eqSkcwixJlyo7s";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function run() {
  console.log("=== Testing Database Connection ===");
  
  // 1. Fetch public forecast data
  console.log("1. Testing public RPC...");
  const { data: forecast, error: forecastErr } = await supabase.rpc('get_public_forecast_data');
  if (forecastErr) {
    console.error("Public RPC failed:", forecastErr);
  } else {
    console.log("Public RPC success. Forecast length:", forecast ? forecast.length : null);
  }

  // 2. Fetch inventory items (anon)
  console.log("2. Fetching inventory (anon)...");
  const { data: inv, error: invErr } = await supabase.from('inventory').select('*');
  if (invErr) {
    console.error("Inventory fetch failed:", invErr);
  } else {
    console.log("Inventory fetch success. Count:", inv ? inv.length : 0);
    if (inv && inv.length > 0) {
      console.log("First item:", inv[0]);
    }
  }

  // 3. Attempt signing in with a whitelisted admin email (or try to sign up if it doesn't exist)
  const email = 'savsbuyhub@gmail.com';
  const password = 'p@ssw0rd_For_S@VS_BuyHub_2026!';
  
  console.log(`3. Attempting sign in for ${email}...`);
  let authResult = await supabase.auth.signInWithPassword({ email, password });
  
  if (authResult.error) {
    console.log("Sign in failed, attempting sign up...");
    const signUpResult = await supabase.auth.signUp({ email, password });
    if (signUpResult.error) {
      console.error("Sign up failed:", signUpResult.error);
      return;
    } else {
      console.log("Sign up succeeded! User created:", signUpResult.data.user?.id);
      // Try signing in again
      authResult = await supabase.auth.signInWithPassword({ email, password });
      if (authResult.error) {
        console.error("Sign in after sign up failed:", authResult.error);
        return;
      }
    }
  }
  
  const session = authResult.data.session;
  const user = authResult.data.user;
  console.log("Successfully logged in! User ID:", user.id);

  // Re-init client with user session to test authenticated calls
  const authSupabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    }
  });

  // 4. Test has_role function
  console.log("4. Testing has_role (app_role)...");
  const { data: isAdmin, error: roleErr } = await authSupabase.rpc('has_role', { 
    _user_id: user.id, 
    _role: 'admin' 
  });
  if (roleErr) {
    console.error("has_role(uuid, app_role) RPC failed:", roleErr);
  } else {
    console.log("has_role(uuid, app_role) result:", isAdmin);
  }

  console.log("5. Testing has_role (text)...");
  const { data: isAdminText, error: roleTextErr } = await authSupabase.rpc('has_role', { 
    _user_id: user.id, 
    _role: 'admin' // string
  });
  if (roleTextErr) {
    console.error("has_role(uuid, text) RPC failed:", roleTextErr);
  } else {
    console.log("has_role(uuid, text) result:", isAdminText);
  }

  // 6. Fetch profiles
  console.log("6. Fetching profiles...");
  const { data: profiles, error: profErr } = await authSupabase.from('profiles').select('*');
  if (profErr) {
    console.error("Profiles fetch failed:", profErr);
  } else {
    console.log("Profiles fetch success. Count:", profiles ? profiles.length : 0);
  }

  // 7. Try inserting a test inventory item to make sure we can log sales for it
  console.log("7. Creating test inventory item...");
  const testSku = "TEST-SKU-" + Date.now();
  const { data: newInv, error: newInvErr } = await authSupabase.from('inventory').insert({
    sku: testSku,
    product_name: "Test Product",
    average_cost_price: 10.0,
    total_bulk_stock_in: 100
  }).select();

  if (newInvErr) {
    console.error("Creating inventory failed:", newInvErr);
    return;
  }
  
  const invItem = newInv[0];
  console.log("Created inventory item:", invItem.id);

  // 8. Try logging a sale for this inventory item
  console.log("8. Creating test sale...");
  const { data: newSale, error: newSaleErr } = await authSupabase.from('sales').insert({
    dispatch_date: new Date().toISOString().split('T')[0],
    platform: 'Offline',
    inventory_id: invItem.id,
    quantity_sold: 1,
    average_selling_price: 15.0,
    courier_partner: 'Other',
    payment_status: 'Pending',
    cost_price: 10.0
  }).select();

  if (newSaleErr) {
    console.error("Creating sale failed:", newSaleErr);
  } else {
    console.log("Created sale successfully!", newSale[0].id);
  }

  // Clean up
  console.log("Cleaning up test records...");
  if (newSale) {
    await authSupabase.from('sales').delete().eq('id', newSale[0].id);
  }
  await authSupabase.from('inventory').delete().eq('id', invItem.id);
  console.log("Done!");
}

run().catch(console.error);
