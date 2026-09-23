/**
 * The two things every fetch helper in src/api shares: `j` turns a response into its JSON and throws
 * the server's error message on a non-2xx status, `H` is the JSON content type header. One copy here
 * instead of one per module (roadmap 103).
 */
export const j = async (res) => {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText)
  return res.json()
}
export const H = { 'Content-Type': 'application/json' }
