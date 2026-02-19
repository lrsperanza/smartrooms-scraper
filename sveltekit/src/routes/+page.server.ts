import { reclassifyClosedRegionDays, type DataEntry } from '$lib/dataProcessor';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const DOWNLOADED_DATA_DIR = 'downloaded-data';
const DATE_REGEX = /^(\d{4}-\d{2}-\d{2})-/;

interface RawRoomRow {
	unitName: string;
	unitFormId?: string;
	roomValue: string;
	roomLabel: string;
	livre: number;
	ocupado: number;
	indisponivel: number;
}

function sanitizeFilename(str: string): string {
	return str.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
}

export async function load() {
	const dir = path.join(process.cwd(), DOWNLOADED_DATA_DIR);
	let files: string[];
	try {
		files = await fs.readdir(dir);
	} catch {
		return { hasData: false, entries: [] as DataEntry[] };
	}

	const jsonFiles = files.filter((f) => f.endsWith('.json'));
	const entries: DataEntry[] = [];

	for (const file of jsonFiles) {
		const match = file.match(DATE_REGEX);
		const dateStr = match ? match[1] : '';
		if (!dateStr) continue;

		const filePrefix = file.replace(/\.json$/, '');

		const date = new Date(dateStr + 'T12:00:00Z');
		const dayOfWeek = date.getUTCDay(); // 0 = Sunday, 1 = Mon, ...

		const filePath = path.join(dir, file);
		const content = await fs.readFile(filePath, 'utf8');
		let rows: RawRoomRow[];
		try {
			rows = JSON.parse(content);
		} catch {
			continue;
		}
		if (!Array.isArray(rows)) continue;

		for (const row of rows) {
			if (!row || typeof row.roomValue !== 'string') continue;
			const unitFormId = row.unitFormId ?? '';
			const roomLabel = row.roomLabel ?? '';
			const htmlFilename = unitFormId
				? `${filePrefix}-${sanitizeFilename(`${unitFormId}-${roomLabel}`)}.html`
				: undefined;

			entries.push({
				date: dateStr,
				dayOfWeek,
				roomKey: row.roomValue,
				unitName: row.unitName ?? '',
				roomLabel,
				livre: Number(row.livre) || 0,
				ocupado: Number(row.ocupado) || 0,
				indisponivel: Number(row.indisponivel) || 0,
				htmlFilename
			});
		}
	}

	const processed = reclassifyClosedRegionDays(entries);

	return {
		hasData: processed.length > 0,
		entries: processed
	};
}
