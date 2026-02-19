<script lang="ts">
	import type { MonthlyEstimationResult } from '$lib/dataProcessor';
	import { HOURLY_RATE, SLOT_DURATION_HOURS } from '$lib/dataProcessor';

	let { estimation } = $props<{ estimation: MonthlyEstimationResult }>();

	const formattedRevenue = $derived(
		estimation.total.revenue.toLocaleString('pt-BR', {
			style: 'currency',
			currency: 'BRL'
		})
	);

	const formattedRate = $derived(
		HOURLY_RATE.toLocaleString('pt-BR', {
			style: 'currency',
			currency: 'BRL'
		})
	);

	const slotMinutes = SLOT_DURATION_HOURS * 60;
</script>

<div class="monthly-estimation">
	<h3 class="monthly-estimation-title">Ocupação mensal estimada</h3>
	{#each estimation.categories as cat}
		<section class="estimation-category">
			<h4 class="estimation-category-title">
				{cat.label}
				{#if cat.noData}
					<span class="estimation-badge">sem dados — assumido 0</span>
				{:else}
					<span class="estimation-badge">{cat.count} {cat.count === 1 ? 'dia' : 'dias'} na amostra</span>
				{/if}
			</h4>
			{#if cat.noData}
				<p class="estimation-no-data">Livre: 0 | Ocupado: 0 | Indisponível: 0</p>
			{:else}
				<dl class="estimation-formulas">
					<div class="estimation-row">
						<dt class="estimation-dt status-livre">Livre</dt>
						<dd class="estimation-dd">{cat.livre.formula}</dd>
					</div>
					<div class="estimation-row">
						<dt class="estimation-dt status-ocupado">Ocupado</dt>
						<dd class="estimation-dd">{cat.ocupado.formula}</dd>
					</div>
					<div class="estimation-row">
						<dt class="estimation-dt status-indisponivel">Indisponível</dt>
						<dd class="estimation-dd">{cat.indisponivel.formula}</dd>
					</div>
				</dl>
			{/if}
		</section>
	{/each}
	<section class="estimation-total">
		<h4 class="estimation-total-title">Total mensal estimado</h4>
		<dl class="estimation-formulas">
			<div class="estimation-row">
				<dt class="estimation-dt status-livre">Livre</dt>
				<dd class="estimation-dd">
					{estimation.categories.map((c) => c.livre.result.toFixed(2)).join(' + ')} =
					{estimation.total.livre.toFixed(2)}
				</dd>
			</div>
			<div class="estimation-row">
				<dt class="estimation-dt status-ocupado">Ocupado</dt>
				<dd class="estimation-dd">
					{estimation.categories.map((c) => c.ocupado.result.toFixed(2)).join(' + ')} =
					{estimation.total.ocupado.toFixed(2)}
				</dd>
			</div>
			<div class="estimation-row">
				<dt class="estimation-dt status-indisponivel">Indisponível</dt>
				<dd class="estimation-dd">
					{estimation.categories.map((c) => c.indisponivel.result.toFixed(2)).join(' + ')} =
					{estimation.total.indisponivel.toFixed(2)}
				</dd>
			</div>
		</dl>
	</section>
	<section class="estimation-revenue">
		<h4 class="estimation-revenue-title">Receita mensal estimada</h4>
		<p class="estimation-revenue-value">{formattedRevenue}</p>
		<p class="estimation-revenue-detail">
			{estimation.total.ocupado.toFixed(2)} slots × {slotMinutes} min × {formattedRate}/h
		</p>
	</section>
</div>
