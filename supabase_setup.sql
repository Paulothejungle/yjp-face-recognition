-- ============================================================
-- SCRIPT SQL SUPABASE - PT. YUDANTA JAYA PUTRA
-- Jalankan di Supabase SQL Editor secara berurutan
-- ============================================================

-- 1. TABEL EMPLOYEES
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  photo_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABEL PROFILES (extend Supabase Auth)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  role VARCHAR(10) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABEL FACE DESCRIPTORS
CREATE TABLE public.face_descriptors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  descriptor JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TABEL ATTENDANCE
CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  check_in TIMESTAMPTZ,
  check_in_lat FLOAT8,
  check_in_lng FLOAT8,
  check_in_location_status VARCHAR(20) DEFAULT 'tidak_diizinkan',
  check_out TIMESTAMPTZ,
  check_out_lat FLOAT8,
  check_out_lng FLOAT8,
  check_out_location_status VARCHAR(20),
  status VARCHAR(20) DEFAULT 'alpha' CHECK (status IN ('hadir', 'terlambat', 'alpha')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, date)
);

-- 5. TABEL SETTINGS
CREATE TABLE public.settings (
  id INT PRIMARY KEY DEFAULT 1,
  office_lat FLOAT8 DEFAULT -6.2088,
  office_lng FLOAT8 DEFAULT 106.8456,
  radius_meters INT DEFAULT 100,
  check_in_deadline TIME DEFAULT '08:30:00',
  check_out_start TIME DEFAULT '17:00:00',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO public.settings (id, office_lat, office_lng, radius_meters)
VALUES (1, -6.2088, 106.8456, 100)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- TRIGGER: Auto-insert ke profiles saat user baru dibuat
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'role', 'user'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_descriptors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Helper function: ambil role user saat ini
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: ambil employee_id user saat ini
CREATE OR REPLACE FUNCTION public.get_my_employee_id()
RETURNS UUID AS $$
  SELECT employee_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- POLICIES: profiles
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Admin can view all profiles"
  ON public.profiles FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "Admin can manage profiles"
  ON public.profiles FOR ALL
  USING (get_my_role() = 'admin');

-- POLICIES: employees
CREATE POLICY "Admin can manage employees"
  ON public.employees FOR ALL
  USING (get_my_role() = 'admin');

CREATE POLICY "Users can view their own employee data"
  ON public.employees FOR SELECT
  USING (id = get_my_employee_id());

-- POLICIES: face_descriptors
CREATE POLICY "Admin can manage face descriptors"
  ON public.face_descriptors FOR ALL
  USING (get_my_role() = 'admin');

CREATE POLICY "Users can view own face descriptor"
  ON public.face_descriptors FOR SELECT
  USING (employee_id = get_my_employee_id());

-- POLICIES: attendance
CREATE POLICY "Admin can manage all attendance"
  ON public.attendance FOR ALL
  USING (get_my_role() = 'admin');

CREATE POLICY "Users can view own attendance"
  ON public.attendance FOR SELECT
  USING (employee_id = get_my_employee_id());

CREATE POLICY "Users can insert own attendance"
  ON public.attendance FOR INSERT
  WITH CHECK (employee_id = get_my_employee_id());

CREATE POLICY "Users can update own attendance"
  ON public.attendance FOR UPDATE
  USING (employee_id = get_my_employee_id());

-- POLICIES: settings
CREATE POLICY "Everyone can read settings"
  ON public.settings FOR SELECT
  USING (TRUE);

CREATE POLICY "Only admin can modify settings"
  ON public.settings FOR ALL
  USING (get_my_role() = 'admin');

-- ============================================================
-- INDEX untuk performa query
-- ============================================================
CREATE INDEX idx_attendance_employee_date ON public.attendance(employee_id, date);
CREATE INDEX idx_attendance_date ON public.attendance(date);
CREATE INDEX idx_face_descriptors_employee ON public.face_descriptors(employee_id);
CREATE INDEX idx_profiles_employee ON public.profiles(employee_id);
