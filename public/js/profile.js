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

  if (file.size > 3 * 1024 * 1024) {
    showToast('warning', 'Foto terlalu besar', 'Maksimum ukuran foto adalah 3MB');
    return;
  }

  const progress = document.getElementById('upload-progress');
  progress.style.display = 'block';

  try {
    // Konversi ke base64
    const base64 = await fileToBase64(file);

    // Preview sementara
    renderAvatar(base64, profileData?.name);

    // Upload ke server
    const result = await Auth.apiCall('PUT', '/api/profile/me/photo', {
      base64,
      fileName: file.name,
      mimeType: file.type
    });

    // Update localStorage user info
    const user = Auth.getUser();
    if (user) {
      user.photo_url = result.photo_url;
      localStorage.setItem('yjp_user', JSON.stringify(user));
    }

    // Re-render avatar dengan URL permanen
    renderAvatar(result.photo_url, profileData?.name);
    profileData.photo_url = result.photo_url;
    showToast('success', 'Foto berhasil diperbarui', '');
  } catch (err) {
    showToast('error', 'Gagal upload foto', err.message);
    // Kembalikan avatar lama jika gagal
    renderAvatar(profileData?.photo_url, profileData?.name);
  } finally {
    progress.style.display = 'none';
    e.target.value = ''; // reset input
  }
});

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
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

loadProfile();
