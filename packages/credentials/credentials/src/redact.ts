/**
 * Copy JSON-shaped runtime output while removing an operation-local secret.
 * Does not serialize the secret into diagnostics or change the input object.
 */
export function redactCredential<T>(value: T, secret: string): T {
  const visit = (item: unknown): unknown => {
    if (typeof item === 'string') return item.split(secret).join('[redacted]')
    if (Array.isArray(item)) return item.map(visit)
    if (item !== null && typeof item === 'object') {
      return Object.fromEntries(Object.entries(item).map(([key, item]) => [key.split(secret).join('[redacted]'), visit(item)]))
    }
    return item
  }
  return (secret.length === 0 ? value : visit(value)) as T
}
