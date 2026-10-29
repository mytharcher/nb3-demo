/** Explicit DTOs for native Response.json(), whose public return type is unknown. */
export async function readJSON<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}
