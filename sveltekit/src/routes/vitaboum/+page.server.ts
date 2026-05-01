import type { VitaboumReservation } from '$lib/vitaboumDataProcessor';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const DOWNLOADED_DATA_DIR = 'downloaded-data';

interface VitaboumJsonFile {
	generatedAt: string;
	date?: string;
	totalReservations: number;
	reservations: VitaboumReservation[];
	summaryByRoomAndDay?: unknown;
}

export async function load() {
	const dir = path.join(process.cwd(), DOWNLOADED_DATA_DIR);
	let files: string[];
	try {
		files = await fs.readdir(dir);
	} catch {
		return { hasData: false, reservations: [] as VitaboumReservation[] };
	}

	const jsonFiles = files.filter((f) => f.endsWith('.json') && f.includes('vitaboum'));
	if (jsonFiles.length === 0) {
		return { hasData: false, reservations: [] as VitaboumReservation[] };
	}

	const seen = new Set<string>();
	const reservations: VitaboumReservation[] = [];
	const sampledDates = new Set<string>();

	// Newest files first so their entries win deduplication
	jsonFiles.sort().reverse();

	for (const file of jsonFiles) {
		const filePath = path.join(dir, file);
		const content = await fs.readFile(filePath, 'utf8');
		let parsed: VitaboumJsonFile;
		try {
			parsed = JSON.parse(content);
		} catch {
			continue;
		}
		if (!parsed.reservations || !Array.isArray(parsed.reservations)) continue;

		if (parsed.date) {
			sampledDates.add(parsed.date);
		}

		for (const r of parsed.reservations) {
			const key = `${r.date}|${r.room}|${r.startTime}|${r.endTime}`;
			if (seen.has(key)) continue;
			seen.add(key);
			reservations.push(r);
		}
	}

	return {
		hasData: reservations.length > 0,
		reservations,
		sampledDates: Array.from(sampledDates).sort()
	};
}
