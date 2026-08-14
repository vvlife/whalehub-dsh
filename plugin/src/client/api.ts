/** WhaleHub 市场 Tab 与 host 半通信的极简客户端。 */

export interface ApiResult<T> {
  ok: boolean
  data?: T
  error?: string
}

export async function call<T>(method: string, payload: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`/whalehub/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = (await res.json()) as ApiResult<T>
  if (!res.ok || !body.ok) {
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return body.data as T
}
