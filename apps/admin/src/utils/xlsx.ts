export function autoSizeColumns(data: any[], maxWidth = 50) {
  if (!data || data.length === 0) return [];

  const keys = Object.keys(data[0]);

  return keys.map((key) => {
    const maxLength = Math.max(
      key.length,
      ...data.map((row) =>
        row[key] ? row[key].toString().length : 0
      )
    );

    return {
      wch: Math.min(maxLength + 2, maxWidth), 
    };
  });
}
