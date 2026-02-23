export interface VitaboumReservation {
	date: string;
	dayOfWeek: string;
	room: string;
	startTime: string;
	endTime: string;
	durationMinutes: number;
	status: string;
}

export interface VitaboumDayPoint {
	date: string;
	dayOfWeekNum: number;
	totalMinutes: number;
	reservationCount: number;
}

export interface VitaboumRoomData {
	room: string;
	dailyData: VitaboumDayPoint[];
}

export const VITABOUM_HOURLY_RATE = 33;

const BUSINESS_DAYS_PER_MONTH = 22;
const SATURDAYS_PER_MONTH = 52 / 12; // ~4.33
const SUNDAYS_AND_HOLIDAYS_PER_MONTH = 52 / 12 + (16 - 16 / 7) / 12;

type DayCategory = 'business' | 'saturday' | 'sunday';

function getDayCategory(dayOfWeek: number): DayCategory {
	if (dayOfWeek === 0) return 'sunday';
	if (dayOfWeek === 6) return 'saturday';
	return 'business';
}

export function groupByRoom(
	reservations: VitaboumReservation[]
): Map<string, VitaboumRoomData> {
	const roomDateMap = new Map<string, Map<string, { totalMinutes: number; count: number }>>();

	for (const r of reservations) {
		let dateMap = roomDateMap.get(r.room);
		if (!dateMap) {
			dateMap = new Map();
			roomDateMap.set(r.room, dateMap);
		}
		let day = dateMap.get(r.date);
		if (!day) {
			day = { totalMinutes: 0, count: 0 };
			dateMap.set(r.date, day);
		}
		day.totalMinutes += r.durationMinutes;
		day.count += 1;
	}

	const result = new Map<string, VitaboumRoomData>();
	for (const [room, dateMap] of roomDateMap) {
		const dailyData: VitaboumDayPoint[] = [];
		for (const [date, data] of dateMap) {
			const d = new Date(date + 'T12:00:00Z');
			dailyData.push({
				date,
				dayOfWeekNum: d.getUTCDay(),
				totalMinutes: data.totalMinutes,
				reservationCount: data.count
			});
		}
		dailyData.sort((a, b) => a.date.localeCompare(b.date));
		result.set(room, { room, dailyData });
	}

	return result;
}

export interface VitaboumCategoryEstimate {
	category: DayCategory;
	label: string;
	daysPerMonth: number;
	count: number;
	avgHours: number;
	totalMonthlyHours: number;
	formula: string;
	noData: boolean;
}

export interface VitaboumMonthlyEstimation {
	categories: VitaboumCategoryEstimate[];
	total: {
		hours: number;
		revenue: number;
	};
}

export function computeMonthlyEstimation(
	dailyData: VitaboumDayPoint[]
): VitaboumMonthlyEstimation {
	const business: VitaboumDayPoint[] = [];
	const saturday: VitaboumDayPoint[] = [];
	const sunday: VitaboumDayPoint[] = [];

	for (const p of dailyData) {
		const cat = getDayCategory(p.dayOfWeekNum);
		if (cat === 'business') business.push(p);
		else if (cat === 'saturday') saturday.push(p);
		else sunday.push(p);
	}

	function categoryResult(
		points: VitaboumDayPoint[],
		label: string,
		category: DayCategory,
		daysPerMonth: number
	): VitaboumCategoryEstimate {
		const noData = points.length === 0;
		const totalMinutes = points.reduce((s, p) => s + p.totalMinutes, 0);
		const n = points.length || 1;
		const avgHours = totalMinutes / 60 / n;
		const totalMonthlyHours = noData ? 0 : avgHours * daysPerMonth;

		const minuteValues = points.map((p) => p.totalMinutes);
		let formula: string;
		if (noData) {
			formula = '0';
		} else if (points.length === 1) {
			formula = `${minuteValues[0]}min ÷ 60 ÷ 1 × ${daysPerMonth} = ${totalMonthlyHours.toFixed(1)}h`;
		} else {
			formula = `(${minuteValues.join('+')}min) ÷ 60 ÷ ${points.length} × ${daysPerMonth} = ${totalMonthlyHours.toFixed(1)}h`;
		}

		return {
			category,
			label,
			daysPerMonth,
			count: points.length,
			avgHours,
			totalMonthlyHours,
			formula,
			noData
		};
	}

	const catBusiness = categoryResult(business, 'Dias Úteis', 'business', BUSINESS_DAYS_PER_MONTH);
	const catSaturday = categoryResult(saturday, 'Sábados', 'saturday', SATURDAYS_PER_MONTH);
	const catSunday = categoryResult(
		sunday,
		'Domingos e Feriados',
		'sunday',
		SUNDAYS_AND_HOLIDAYS_PER_MONTH
	);

	const totalHours =
		catBusiness.totalMonthlyHours +
		catSaturday.totalMonthlyHours +
		catSunday.totalMonthlyHours;

	return {
		categories: [catBusiness, catSaturday, catSunday],
		total: {
			hours: totalHours,
			revenue: totalHours * VITABOUM_HOURLY_RATE
		}
	};
}
