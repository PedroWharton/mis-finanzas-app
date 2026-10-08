self.addEventListener('push', (event) => {
  let data = { title: 'Mis Finanzas', body: 'Hay novedades' }
  try { data = event.data.json() } catch {}
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: '/icons/icono-192.png' }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow('/recomendaciones'))
})
