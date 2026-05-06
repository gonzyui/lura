export const stripHtml = (text?: string | null): string =>
	text
		?.replace(/<[^>]*>/g, '')
		.replace(/\s+/g, ' ')
		.trim() || '';

export const formatDate = (date?: { year?: number | null; month?: number | null; day?: number | null } | null): string => {
	if (!date?.year) return 'Unknown';
	return [date.year, date.month, date.day].filter(Boolean).join('-');
};

export const truncate = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 3)}...` : text);

export function capitalize(str: string) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

export function formatCategory(category: string) {
	return category.split(' > ').map(capitalize).join(' > ');
}

export function formatBytes(bytes: number) {
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
