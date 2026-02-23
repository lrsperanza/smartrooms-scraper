<script lang="ts">
	import { Chart } from 'chart.js/auto';
	import type { VitaboumDayPoint } from '$lib/vitaboumDataProcessor';

	let { dailyData } = $props<{ dailyData: VitaboumDayPoint[] }>();

	let canvasEl: HTMLCanvasElement;

	$effect(() => {
		if (!canvasEl || dailyData.length === 0) return;

		const labels = dailyData.map((p: VitaboumDayPoint) => p.date);
		const hours = dailyData.map((p: VitaboumDayPoint) => +(p.totalMinutes / 60).toFixed(2));
		const counts = dailyData.map((p: VitaboumDayPoint) => p.reservationCount);

		const chart = new Chart(canvasEl, {
			type: 'bar',
			data: {
				labels,
				datasets: [
					{
						label: 'Horas reservadas',
						data: hours,
						backgroundColor: '#8b5cf6'
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				scales: {
					y: {
						beginAtZero: true,
						title: { display: true, text: 'Horas' }
					}
				},
				plugins: {
					legend: { position: 'top' },
					tooltip: {
						callbacks: {
							afterBody(items) {
								const idx = items[0]?.dataIndex;
								if (idx != null) {
									return `${counts[idx]} reserva(s)`;
								}
								return '';
							}
						}
					}
				}
			}
		});

		return () => chart.destroy();
	});
</script>

<div class="occupation-chart-wrap">
	<canvas bind:this={canvasEl} class="occupation-chart"></canvas>
</div>
