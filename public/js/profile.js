// ============================================================
// PROFILE.JS — Halaman profil user/admin
// ============================================================
if (!Auth.requireAuth()) throw new Error('Not auth');
document.getElementById('navbar-container').innerHTML = renderNavbar('profile');

let profileData = null;

// ── Load profil
async function loadProfile() {
  try {
    profileData = await Auth.apiCall('GET', '/api/profile/me');

    // Tampilkan nama & role
    document.getElementById('profile-name').textContent = profileData.name;
    document.getElementById('profile-role').textContent = profileData.role === 'admin' ? '👑 Admin' : '👤 Karyawan';
    document.getElementById('inp-profile-name').value = profileData.name;
    document.getElementById('inp-profile-email').value = profileData.email;

    // Tampilkan foto
    renderAvatar(profileData.photo_url, profileData.name);
  } catch (err) {
    showToast('error', 'Gagal memuat profil', err.message);
  }
}

function renderAvatar(photoUrl, name) {
  const avatarEl = document.getElementById('photo-avatar');
  const initial = name?.[0]?.toUpperCase() || '?';
  if (photoUrl) {
    avatarEl.innerHTML = `<img src="${photoUrl}" alt="${name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  } else {
    avatarEl.innerHTML = `<span id="avatar-initial">${initial}</span>`;
  }
}

// ── Upload foto
document.getElementById('photo-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    showToast('warning', 'Foto terlalu besar', 'Maksimum 5MB');
    return;
  }

  const progress = document.getElementById('upload-progress');
  progress.style.display = 'block';

  try {
    // Kompres ke max 400x400, kualitas 75%
    const base64 = await compressImage(file, 400, 0.75);

    renderAvatar(base64, profileData?.name);

    const result = await Auth.apiCall('PUT', '/api/profile/me/photo', { base64 });

    const user = Auth.getUser();
    if (user) {
      user.photo_url = result.photo_url;
      localStorage.setItem('yjp_user', JSON.stringify(user));
    }

    renderAvatar(result.photo_url, profileData?.name);
    profileData.photo_url = result.photo_url;
    showToast('success', 'Foto berhasil diperbarui', '');
  } catch (err) {
    showToast('error', 'Gagal upload foto', err.message);
    renderAvatar(profileData?.photo_url, profileData?.name);
  } finally {
    progress.style.display = 'none';
    e.target.value = '';
  }
});

/**
 * Kompres gambar via Canvas API sebelum upload
 * @returns {Promise<string>} base64 JPEG data URL
 */
function compressImage(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (ev) => {
      img.src = ev.target.result;
      img.onload = () => {
        let { width, height } = img;
        if (width > height) {
          if (width > maxSize) { height = Math.round(height * maxSize / width); width = maxSize; }
        } else {
          if (height > maxSize) { width = Math.round(width * maxSize / height); height = maxSize; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Update nama
document.getElementById('form-profile').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('inp-profile-name').value.trim();
  if (!name) return;

  const btn = document.getElementById('btn-save-profile');
  btn.textContent = 'Menyimpan...';
  btn.disabled = true;

  try {
    await Auth.apiCall('PUT', '/api/profile/me', { name });

    // Update localStorage
    const user = Auth.getUser();
    if (user) {
      user.name = name;
      localStorage.setItem('yjp_user', JSON.stringify(user));
    }

    document.getElementById('profile-name').textContent = name;
    profileData.name = name;
    showToast('success', 'Profil berhasil diperbarui', '');
  } catch (err) {
    showToast('error', 'Gagal memperbarui profil', err.message);
  } finally {
    btn.textContent = '💾 Simpan Perubahan';
    btn.disabled = false;
  }
});

// ── Ganti password
document.getElementById('form-change-password').addEventListener('submit', async (e) => {
  e.preventDefault();
  const currentPassword = document.getElementById('inp-current-password').value;
  const newPassword = document.getElementById('inp-new-password').value;
  const confirmPassword = document.getElementById('inp-confirm-password').value;

  if (newPassword !== confirmPassword) {
    showToast('warning', 'Password tidak cocok', 'Konfirmasi password baru tidak sesuai');
    return;
  }

  const btn = document.getElementById('btn-change-password');
  btn.textContent = 'Memproses...';
  btn.disabled = true;

  try {
    await Auth.apiCall('PUT', '/api/profile/me/password', { currentPassword, newPassword });
    showToast('success', 'Password berhasil diubah', 'Silakan login ulang jika diminta');
    document.getElementById('form-change-password').reset();
  } catch (err) {
    showToast('error', 'Gagal mengubah password', err.message);
  } finally {
    btn.textContent = '🔐 Ubah Password';
    btn.disabled = false;
  }
});

loadProfile();
