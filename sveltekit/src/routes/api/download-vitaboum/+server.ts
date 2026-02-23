import { BlobServiceClient } from '@azure/storage-blob';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export const POST: RequestHandler = async () => {
	const connectionString = env.AZURE_STORAGE_CONNECTION_STRING;
	const containerName = env.AZURE_CONTAINER_NAME ?? 'personal-files';
	const prefix = 'vitaboum-scraping/';

	if (!connectionString) {
		return json({ error: 'AZURE_STORAGE_CONNECTION_STRING is not set' }, { status: 500 });
	}

	const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
	const containerClient = blobServiceClient.getContainerClient(containerName);

	const downloadDir = path.join(process.cwd(), 'downloaded-data');
	await fs.mkdir(downloadDir, { recursive: true });

	let downloaded = 0;
	for await (const blob of containerClient.listBlobsFlat({ prefix })) {
		if (!blob.name.endsWith('.json')) continue;
		const blobClient = containerClient.getBlobClient(blob.name);
		const buffer = await blobClient.downloadToBuffer();
		const filename = path.basename(blob.name);
		const filePath = path.join(downloadDir, filename);
		await fs.writeFile(filePath, buffer.toString('utf8'), 'utf8');
		downloaded++;
	}

	return json({ downloaded });
};
