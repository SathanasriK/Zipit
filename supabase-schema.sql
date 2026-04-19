-- ZipIt Travel Packing App - Supabase Database Schema
-- Run these SQL commands in your Supabase SQL editor

-- Enable Row Level Security (RLS)
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

-- Create users table (extends auth.users)
CREATE TABLE public.users (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create trips table
CREATE TABLE public.trips (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    destination TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    duration INTEGER NOT NULL,
    transport TEXT NOT NULL,
    airline TEXT,
    purpose TEXT NOT NULL,
    weather_data JSONB,
    packing_progress INTEGER DEFAULT 0,
    checked_items TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create packing_lists table
CREATE TABLE public.packing_lists (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE NOT NULL,
    category TEXT NOT NULL,
    items JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create packing_templates table (for saved templates)
CREATE TABLE public.packing_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    purpose TEXT NOT NULL,
    items JSONB NOT NULL,
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_trips_user_id ON public.trips(user_id);
CREATE INDEX idx_trips_start_date ON public.trips(start_date);
CREATE INDEX idx_packing_lists_trip_id ON public.packing_lists(trip_id);
CREATE INDEX idx_packing_templates_user_id ON public.packing_templates(user_id);
CREATE INDEX idx_packing_templates_public ON public.packing_templates(is_public) WHERE is_public = true;

-- Row Level Security Policies

-- Users can only see and modify their own data
CREATE POLICY "Users can view own profile" ON public.users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.users
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.users
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Trips policies
CREATE POLICY "Users can view own trips" ON public.trips
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trips" ON public.trips
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trips" ON public.trips
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own trips" ON public.trips
    FOR DELETE USING (auth.uid() = user_id);

-- Packing lists policies
CREATE POLICY "Users can view packing lists for own trips" ON public.packing_lists
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.trips 
            WHERE trips.id = packing_lists.trip_id 
            AND trips.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert packing lists for own trips" ON public.packing_lists
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.trips 
            WHERE trips.id = packing_lists.trip_id 
            AND trips.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update packing lists for own trips" ON public.packing_lists
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.trips 
            WHERE trips.id = packing_lists.trip_id 
            AND trips.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete packing lists for own trips" ON public.packing_lists
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.trips 
            WHERE trips.id = packing_lists.trip_id 
            AND trips.user_id = auth.uid()
        )
    );

-- Packing templates policies
CREATE POLICY "Users can view own templates and public templates" ON public.packing_templates
    FOR SELECT USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY "Users can insert own templates" ON public.packing_templates
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own templates" ON public.packing_templates
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own templates" ON public.packing_templates
    FOR DELETE USING (auth.uid() = user_id);

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packing_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packing_templates ENABLE ROW LEVEL SECURITY;

-- Create function to handle user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, full_name)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user creation
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_trips_updated_at
    BEFORE UPDATE ON public.trips
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_packing_lists_updated_at
    BEFORE UPDATE ON public.packing_lists
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_packing_templates_updated_at
    BEFORE UPDATE ON public.packing_templates
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
