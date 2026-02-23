<script lang="ts">
	import type { VitaboumMonthlyEstimation, VitaboumCategoryEstimate } from '$lib/vitaboumDataProcessor';
	import { VITABOUM_HOURLY_RATE } from '$lib/vitaboumDataProcessor';

	let { estimation } = $props<{ estimation: VitaboumMonthlyEstimation }>();

	const formattedRevenue = $derived(
		estimation.total.revenue.toLocaleString('pt-BR', {
			style: 'currency',
			currency: 'BRL'
		})
	);

	const formattedRate = $derived(
		VITABOUM_HOURLY_RATE.toLocaleString('pt-BR', {
			style: 'currency',
			currency: 'BRL'
		})
	);
</script>

<div class="monthly-estimation">
	<h3 class="monthly-estimation-title">Estimativa mensal</h3>
	{#each estimation.categories as cat}
		<section class="estimation-category">
			<h4 class="estimation-category-title">
				{cat.label}
				{#if cat.noData}
					<span class="estimation-badge">sem dados — assumido 0</span>
				{:else}
					<span class="estimation-badge"
						>{cat.count}
						{cat.count === 1 ? 'dia' : 'dias'} na amostra</span
					>
				{/if}
			</h4>
			{#if cat.noData}
				<p class="estimation-no-data">Horas reservadas: 0h</p>
			{:else}
				<dl class="estimation-formulas">
					<div class="estimation-row">
						<dt class="estimation-dt status-ocupado">Reservado</dt>
						<dd class="estimation-dd">{cat.formula}</dd>
					</div>
				</dl>
			{/if}
		</section>
	{/each}
	<section class="estimation-total">
		<h4 class="estimation-total-title">Total mensal estimado</h4>
		<dl class="estimation-formulas">
			<div class="estimation-row">
				<dt class="estimation-dt status-ocupado">Horas</dt>
				<dd class="estimation-dd">
					{estimation.categories.map((c: VitaboumCategoryEstimate) => c.totalMonthlyHours.toFixed(1)).join(' + ')} =
					{estimation.total.hours.toFixed(1)}h
				</dd>
			</div>
		</dl>
	</section>
	<section class="estimation-revenue">
		<h4 class="estimation-revenue-title">Receita mensal estimada</h4>
		<p class="estimation-revenue-value">{formattedRevenue}</p>
		<p class="estimation-revenue-detail">
			{estimation.total.hours.toFixed(1)}h × {formattedRate}/h
		</p>
	</section>
</div>
