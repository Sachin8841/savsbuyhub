const PAGE_SIZE = 500;

/** Fetch every row in ordered chunks so the API's response cap cannot silently truncate ledgers. */
export async function fetchAllPages<T>(
  loadPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await loadPage(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}