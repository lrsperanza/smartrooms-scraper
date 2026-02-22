/** Entry as returned from the server (one row per room per file/date). */
export interface DataEntry {
	date: string;
	dayOfWeek: number;
	roomKey: string;
	unitName: string;
	roomLabel: string;
	livre: number;
	ocupado: number;
	indisponivel: number;
	htmlFilename?: string;
}

export interface DataPoint {
	date: string;
	dayOfWeek: number;
	livre: number;
	ocupado: number;
	indisponivel: number;
	htmlFilename?: string;
}

export interface RoomData {
	unitName: string;
	roomLabel: string;
	dataPoints: DataPoint[];
}

const BUSINESS_DAYS_PER_MONTH = 22;
const SATURDAYS_PER_MONTH = 52 / 12; // ~4.33
const SUNDAYS_AND_HOLIDAYS_PER_MONTH = 52 / 12 + (16-16/7)/12; // ~5.47 - 16 days of holidays per year minus 1/7 probability of a holiday falling on a Sunday
export const HOURLY_RATE = 25;
export const SLOT_DURATION_HOURS = 0.5; // each occupation slot = 30 minutes

export type DayCategory = 'business' | 'saturday' | 'sunday';

export interface CategoryEstimate {
	category: DayCategory;
	label: string;
	daysPerMonth: number;
	count: number;
	livre: { sum: number; avg: number; formula: string; result: number };
	ocupado: { sum: number; avg: number; formula: string; result: number };
	indisponivel: { sum: number; avg: number; formula: string; result: number };
	noData: boolean;
}

export interface MonthlyEstimationResult {
	categories: CategoryEstimate[];
	total: {
		livre: number;
		ocupado: number;
		indisponivel: number;
		revenue: number;
	};
}

function getDayCategory(dayOfWeek: number): DayCategory {
	// JS Date.getDay(): 0 = Sunday, 1 = Mon, ..., 6 = Saturday
	if (dayOfWeek === 0) return 'sunday';
	if (dayOfWeek === 6) return 'saturday';
	return 'business';
}

/**
 * Detects days where an entire region (unitName) shows 100% occupancy
 * (every room has livre === 0 and indisponivel === 0), which indicates the
 * administrator closed all rooms (e.g. holidays like Brazilian Carnival).
 * Reclassifies those entries by moving ocupado → indisponivel and setting
 * dayOfWeek to 0 (Sunday) so the day counts as unavailable and falls into
 * the "Domingos e Feriados" category rather than inflating business-day occupancy.
 * 
 * Additionally, forcibly sets all Sundays (dayOfWeek === 0) as fully unavailable
 * to correct bugs where they were stored as available or occupied.
 */
export function reclassifyClosedRegionDays(entries: DataEntry[]): DataEntry[] {
	// Group entries by (unitName, date) to inspect each region-day
	const regionDateMap = new Map<string, DataEntry[]>();
	for (const e of entries) {
		const key = `${e.unitName}|||${e.date}`;
		let group = regionDateMap.get(key);
		if (!group) {
			group = [];
			regionDateMap.set(key, group);
		}
		group.push(e);
	}

	// Build set of dates where at least one region has ALL rooms 100% "occupied" (livre=0, indisponivel=0)
	const closedDates = new Set<string>();
	for (const [key, group] of regionDateMap) {
		const allFullyOccupied = group.every((e) => e.livre === 0 && e.indisponivel === 0 && e.ocupado > 0);
		if (allFullyOccupied) {
			const date = key.split('|||')[1];
			closedDates.add(date);
		}
	}

	const hasSundays = entries.some((e) => e.dayOfWeek === 0);
	if (closedDates.size === 0 && !hasSundays) return entries;

	// Reclassify: move everything to indisponivel for closed dates across all regions and for all Sundays
	return entries.map((e) => {
		if (e.dayOfWeek === 0 || closedDates.has(e.date)) {
			return { 
				...e, 
				indisponivel: e.indisponivel + e.ocupado + e.livre, 
				ocupado: 0, 
				livre: 0, 
				dayOfWeek: 0 
			};
		}
		return e;
	});
}

/** Extracts the room type from a roomLabel like "sala01 - Executiva" → "Executiva" */
export function extractRoomType(roomLabel: string): string {
	const idx = roomLabel.indexOf(' - ');
	return idx >= 0 ? roomLabel.slice(idx + 3) : roomLabel;
}

export interface RegionRoomTypeData {
	roomType: string;
	dataPoints: DataPoint[];
}

export interface RegionData {
	unitName: string;
	roomTypes: RegionRoomTypeData[];
}

interface AccumulatedPoint {
	date: string;
	dayOfWeek: number;
	livre: number;
	ocupado: number;
	indisponivel: number;
	count: number;
}

/**
 * Aggregates entries by region (unitName) and room type.
 * For each region + room type + date, averages livre/ocupado/indisponivel across all rooms.
 */
export function groupByRegion(entries: DataEntry[]): Map<string, RegionData> {
	// unitName → roomType → date → accumulated totals + count
	const regionMap = new Map<string, Map<string, Map<string, AccumulatedPoint>>>();

	for (const e of entries) {
		const roomType = extractRoomType(e.roomLabel);

		let typeMap = regionMap.get(e.unitName);
		if (!typeMap) {
			typeMap = new Map();
			regionMap.set(e.unitName, typeMap);
		}

		let dateMap = typeMap.get(roomType);
		if (!dateMap) {
			dateMap = new Map();
			typeMap.set(roomType, dateMap);
		}

		let ap = dateMap.get(e.date);
		if (!ap) {
			ap = { date: e.date, dayOfWeek: e.dayOfWeek, livre: 0, ocupado: 0, indisponivel: 0, count: 0 };
			dateMap.set(e.date, ap);
		}
		ap.livre += e.livre;
		ap.ocupado += e.ocupado;
		ap.indisponivel += e.indisponivel;
		ap.count += 1;
	}

	const result = new Map<string, RegionData>();
	for (const [unitName, typeMap] of regionMap) {
		const roomTypes: RegionRoomTypeData[] = [];
		for (const [roomType, dateMap] of typeMap) {
			const dataPoints: DataPoint[] = Array.from(dateMap.values())
				.sort((a, b) => a.date.localeCompare(b.date))
				.map((ap) => ({
					date: ap.date,
					dayOfWeek: ap.dayOfWeek,
					livre: ap.livre / ap.count,
					ocupado: ap.ocupado / ap.count,
					indisponivel: ap.indisponivel / ap.count
				}));
			roomTypes.push({ roomType, dataPoints });
		}
		roomTypes.sort((a, b) => a.roomType.localeCompare(b.roomType));
		result.set(unitName, { unitName, roomTypes });
	}

	return result;
}

/**
 * Groups all entries by room (roomValue). Each room gets sorted dataPoints by date.
 */
export function groupByRoom(entries: DataEntry[]): Map<string, RoomData> {
	const byRoom = new Map<string, RoomData>();

	for (const e of entries) {
		let room = byRoom.get(e.roomKey);
		if (!room) {
			room = { unitName: e.unitName, roomLabel: e.roomLabel, dataPoints: [] };
			byRoom.set(e.roomKey, room);
		}
		room.dataPoints.push({
			date: e.date,
			dayOfWeek: e.dayOfWeek,
			livre: e.livre,
			ocupado: e.ocupado,
			indisponivel: e.indisponivel,
			htmlFilename: e.htmlFilename
		});
	}

	// Sort dataPoints by date per room
	for (const room of byRoom.values()) {
		room.dataPoints.sort((a, b) => a.date.localeCompare(b.date));
	}

	return byRoom;
}

/**
 * Computes monthly estimation for one room: split by business / Saturday / Sunday,
 * average per category, multiply by days-per-month, and return full breakdown.
 */
export function computeMonthlyEstimation(dataPoints: DataPoint[]): MonthlyEstimationResult {
	const business: DataPoint[] = [];
	const saturday: DataPoint[] = [];
	const sunday: DataPoint[] = [];

	for (const p of dataPoints) {
		const cat = getDayCategory(p.dayOfWeek);
		if (cat === 'business') business.push(p);
		else if (cat === 'saturday') saturday.push(p);
		else sunday.push(p);
	}

	function categoryResult(
		points: DataPoint[],
		label: string,
		daysPerMonth: number
	): CategoryEstimate {
		const noData = points.length === 0;
		const sumL = points.reduce((s, p) => s + p.livre, 0);
		const sumO = points.reduce((s, p) => s + p.ocupado, 0);
		const sumI = points.reduce((s, p) => s + p.indisponivel, 0);
		const n = points.length || 1;
		const avgL = sumL / n;
		const avgO = sumO / n;
		const avgI = sumI / n;
		const resultL = noData ? 0 : avgL * daysPerMonth;
		const resultO = noData ? 0 : avgO * daysPerMonth;
		const resultI = noData ? 0 : avgI * daysPerMonth;

		const formulaPart = noData
			? '0'
			: points.length === 1
				? `${sumL} / 1`
				: `(${points.map((p) => p.livre).join('+')}) / ${points.length}`;
		const formulaL = noData ? '0' : `${formulaPart} x ${daysPerMonth} = ${resultL.toFixed(2)}`;
		const formulaPartO = noData
			? '0'
			: points.length === 1
				? `${sumO} / 1`
				: `(${points.map((p) => p.ocupado).join('+')}) / ${points.length}`;
		const formulaO = noData ? '0' : `${formulaPartO} x ${daysPerMonth} = ${resultO.toFixed(2)}`;
		const formulaPartI = noData
			? '0'
			: points.length === 1
				? `${sumI} / 1`
				: `(${points.map((p) => p.indisponivel).join('+')}) / ${points.length}`;
		const formulaI = noData ? '0' : `${formulaPartI} x ${daysPerMonth} = ${resultI.toFixed(2)}`;

		return {
			category: label === 'Dias Uteis' ? 'business' : label === 'Sabados' ? 'saturday' : 'sunday',
			label,
			daysPerMonth,
			count: points.length,
			livre: { sum: sumL, avg: avgL, formula: formulaL, result: resultL },
			ocupado: { sum: sumO, avg: avgO, formula: formulaO, result: resultO },
			indisponivel: { sum: sumI, avg: avgI, formula: formulaI, result: resultI },
			noData
		};
	}

	const catBusiness = categoryResult(business, 'Dias Uteis', BUSINESS_DAYS_PER_MONTH);
	const catSaturday = categoryResult(saturday, 'Sabados', SATURDAYS_PER_MONTH);
	const catSunday = categoryResult(sunday, 'Domingos e Feriados', SUNDAYS_AND_HOLIDAYS_PER_MONTH);

	const totalOcupado =
		catBusiness.ocupado.result + catSaturday.ocupado.result + catSunday.ocupado.result;

	const total = {
		livre: catBusiness.livre.result + catSaturday.livre.result + catSunday.livre.result,
		ocupado: totalOcupado,
		indisponivel:
			catBusiness.indisponivel.result +
			catSaturday.indisponivel.result +
			catSunday.indisponivel.result,
		revenue: totalOcupado * SLOT_DURATION_HOURS * HOURLY_RATE
	};

	return {
		categories: [catBusiness, catSaturday, catSunday],
		total
	};
}
