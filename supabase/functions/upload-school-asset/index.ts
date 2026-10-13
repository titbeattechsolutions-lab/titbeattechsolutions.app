import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const sessionToken = formData.get('sessionToken');
    const expectedTenantId = formData.get('tenantId');
    const uploadType = formData.get('uploadType'); // 'logo' or 'template'

    if (!file || !(file instanceof File) || !sessionToken || !expectedTenantId || !uploadType) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: corsHeaders });
    }

    if (uploadType !== 'logo' && uploadType !== 'template') {
      return new Response(JSON.stringify({ error: 'Invalid uploadType' }), { status: 400, headers: corsHeaders });
    }

    // Initialize Supabase Admin Client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Session Token Validation & Tenant Scoping
    const { data: sessionData, error: sessionError } = await supabaseAdmin
      .from('tenant_sessions')
      .select('tenant_id, tenants!inner(status)')
      .eq('token', sessionToken)
      .gt('expires_at', new Date().toISOString())
      .in('tenants.status', ['trial', 'active'])
      .maybeSingle();

    if (sessionError || !sessionData) {
      return new Response(JSON.stringify({ error: 'Unauthorized or expired session' }), { status: 401, headers: corsHeaders });
    }

    // EXACT strict match (===), not prefix/substring
    if (sessionData.tenant_id !== expectedTenantId) {
      return new Response(JSON.stringify({ error: 'Tenant mismatch bypass attempt' }), { status: 403, headers: corsHeaders });
    }

    // 2. Server-side Re-validation (Size & Magic Bytes)
    if (file.size > 5242880) {
      return new Response(JSON.stringify({ error: 'File exceeds 5MB limit' }), { status: 400, headers: corsHeaders });
    }

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const isPng = bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
    const isJpeg = bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;

    if (!isPng && !isJpeg) {
      return new Response(JSON.stringify({ error: 'Invalid magic bytes. Only genuine PNG/JPEG files are allowed.' }), { status: 400, headers: corsHeaders });
    }

    // 3. Upload File via Admin Key
    const fileExt = isPng ? 'png' : 'jpg';
    const fileName = `${expectedTenantId}_${uploadType}.${fileExt}`;
    const filePath = `${uploadType}s/${fileName}`; // logos/... or templates/...

    
    // Delete existing files to prevent storage leak
    const bucket = supabaseAdmin.storage.from('school-assets');
    const folder = uploadType + 's';
    const { data: existingFiles } = await bucket.list(folder, { search: expectedTenantId + '_' + uploadType });
    if (existingFiles && existingFiles.length > 0) {
      await bucket.remove(existingFiles.map(f => folder + '/' + f.name));
    }
    
const { error: uploadError } = await supabaseAdmin.storage
      .from('school-assets')
      .upload(filePath, arrayBuffer, {
        contentType: isPng ? 'image/png' : 'image/jpeg',
        upsert: true,
        cacheControl: '3600'
      });

    if (uploadError) {
      return new Response(JSON.stringify({ error: `Upload failed: ${uploadError.message}` }), { status: 500, headers: corsHeaders });
    }

    const { data: publicUrlData } = supabaseAdmin.storage.from('school-assets').getPublicUrl(filePath);

    return new Response(
      JSON.stringify({ publicUrl: publicUrlData.publicUrl }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});

