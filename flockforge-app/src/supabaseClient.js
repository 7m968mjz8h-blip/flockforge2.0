import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase environment variables are missing. Create a .env file (see .env.example) ' +
    'with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, and set the same two values ' +
    'in your Vercel project settings under Environment Variables.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
