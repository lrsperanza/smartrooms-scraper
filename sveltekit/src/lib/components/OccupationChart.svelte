<script lang="ts">
	import { Chart } from 'chart.js/auto';
	import type { DataPoint } from '$lib/dataProcessor';

	let { dataPoints } = $props<{ dataPoints: DataPoint[] }>();

	let canvasEl: HTMLCanvasElement;

	$effect(() => {
		if (!canvasEl || dataPoints.length === 0) return;
		const dates = dataPoints.map((p: DataPoint) => p.date) as string[];
		const labels: string[] = Array.from(new Set(dates)).sort();
		const byDate = new Map<string, DataPoint>();
		for (const p of dataPoints) byDate.set(p.date, p);
		const livre = labels.map((d: string) => byDate.get(d)?.livre ?? 0);
		const ocupado = labels.map((d: string) => byDate.get(d)?.ocupado ?? 0);
		const indisponivel = labels.map((d: string) => byDate.get(d)?.indisponivel ?? 0);

		const htmlFilenames = labels.map((d: string) => byDate.get(d)?.htmlFilename);

		const chart = new Chart(canvasEl, {
			type: 'bar',
			data: {
				labels,
				datasets: [
					{ label: 'Livre', data: livre, backgroundColor: '#22c55e', stack: 'stack0' },
					{ label: 'Ocupado', data: ocupado, backgroundColor: '#ef4444', stack: 'stack0' },
					{
						label: 'Indisponível',
						data: indisponivel,
						backgroundColor: '#94a3b8',
						stack: 'stack0'
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				scales: {
					x: { stacked: true },
					y: { stacked: true, beginAtZero: true }
				},
				plugins: {
					legend: { position: 'top' },
					tooltip: {
						callbacks: {
							afterBody(items) {
								const idx = items[0]?.dataIndex;
								if (idx != null && htmlFilenames[idx]) {
									return '(clique para ver HTML original)';
								}
								return '';
							}
						}
					}
				},
				onClick(_event, elements) {
					if (elements.length === 0) return;
					const idx = elements[0].index;
					const filename = htmlFilenames[idx];
					if (filename) {
						window.open(`/api/html-snapshot/${encodeURIComponent(filename)}`, '_blank');
					}
				},
				onHover(event, elements) {
					const canvas = event.native?.target as HTMLCanvasElement | undefined;
					if (!canvas) return;
					if (elements.length > 0) {
						const idx = elements[0].index;
						canvas.style.cursor = htmlFilenames[idx] ? 'pointer' : 'default';
					} else {
						canvas.style.cursor = 'default';
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
