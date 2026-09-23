const j = async (res) => {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText)
  return res.json()
}
const H = { 'Content-Type': 'application/json' }
export const getMachines = () => fetch('/api/machines').then(j)
export const getMachine = (key) => fetch(`/api/machines/${encodeURIComponent(key)}`).then(j)
/** "from" is the same machine as "to": everything filed under from counts under to from now on. */
export const aliasMachine = (from, to) => fetch('/api/machines/alias', { method: 'POST', headers: H, body: JSON.stringify({ from, to }) }).then(j)
export const renameMachine = (key, name) => fetch('/api/machines/rename', { method: 'POST', headers: H, body: JSON.stringify({ key, name }) }).then(j)
/** The task gets the machine's display name as its project. */
export const assignMachine = (taskId, key) => fetch('/api/machines/assign', { method: 'POST', headers: H, body: JSON.stringify({ taskId, key }) }).then(j)
