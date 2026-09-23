if (getClassId()) {
    document.getElementById('class-selection').classList.add('hidden');
    loadSupabaseData();
} else {
    document.getElementById('class-selection').classList.remove('hidden');
}
updateCountdown();
setInterval(updateCountdown, 1000);
window.addEventListener('storage', updateViews);
updateViews();
