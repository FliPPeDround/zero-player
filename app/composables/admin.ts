/**
 * Lobby admin mode: enabled by opening the lobby with
 * `/?admin=<password>`. The password is validated by the server (it never
 * ships in the client bundle); when the check passes, every room card gets
 * a one-click immediate-close button backed by the password-guarded
 * `admin-close` endpoint.
 */
export function useAdminMode() {
  const route = useRoute()
  const secret = computed(() => {
    const value = route.query.admin
    return typeof value === 'string' ? value : null
  })

  const isAdmin = ref(false)

  async function check() {
    if (!secret.value) {
      isAdmin.value = false
      return
    }
    try {
      const { admin } = await $fetch('/api/admin/verify', {
        method: 'POST',
        body: { secret: secret.value },
      })
      isAdmin.value = admin === true
    }
    catch {
      isAdmin.value = false
    }
  }

  // The production lobby is a prerendered static page, so the server cannot
  // vary the HTML by query param and the initial payload always says
  // `admin: false`. Verify explicitly on mount (and whenever the query
  // changes) instead of relying on useFetch's payload/watcher behavior.
  watch(secret, check, { immediate: true })

  return { isAdmin, adminSecret: secret }
}
