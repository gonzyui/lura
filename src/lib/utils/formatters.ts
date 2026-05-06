export const stripHtml = (text?: string | null): string =>
    text
        ?.replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim() || '';

export const formatDate = (date?: { year?: number | null; month?: number | null; day?: number | null } | null): string => {
    if (!date?.year) return 'Unknown';
    return [date.year, date.month, date.day].filter(Boolean).join('-');
};

export const truncate = (text: string, max: number): string =>
    text.length > max ? `${text.slice(0, max - 3)}...` : text;
