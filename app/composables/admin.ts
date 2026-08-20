/**
 * Lobby admin mode: enabled by opening the lobby with
 * `/?admin=<password>`. The password is validated by the server (it never
 * ships in the client bundle); when the check passes, every room card gets
 * a one-click immediate-close button backed by the password-guarded
 * `admin-close` endpoint.
 */
export async function useAdminMode() {
  const route = useRoute()
  const secret = computed(() => {
    const value = route.query.admin
    return typeof value === 'string' ? value : null
  })

  const { data } = await useFetch('/api/admin/verify', {
    method: 'POST',
    body: { secret: secret.value },
    watch: [secret],
  })

  const isAdmin = computed(() => data.value?.admin === true)
  return { isAdmin, adminSecret: secret }
}
