import { BlobServiceClient } from '@azure/storage-blob';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async ({ params }) => {
	const filename = params.filename;
	if (!filename || !filename.endsWith('.html')) {
		return error(400, 'Invalid filename');
	}

	const connectionString = env.AZURE_STORAGE_CONNECTION_STRING;
	const containerName = env.AZURE_CONTAINER_NAME ?? 'personal-files';
	const prefix = env.AZURE_BLOB_PREFIX ?? 'smartrooms-scraping/';

	if (!connectionString) {
		return error(500, 'AZURE_STORAGE_CONNECTION_STRING is not set');
	}

	const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
	const containerClient = blobServiceClient.getContainerClient(containerName);
	const blobClient = containerClient.getBlobClient(`${prefix}${filename}`);

	try {
		const downloadResponse = await blobClient.downloadToBuffer();
		return new Response(downloadResponse.toString('utf8'), {
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
				'Cache-Control': 'public, max-age=86400'
			}
		});
	} catch (e: unknown) {
		const statusCode = (e as { statusCode?: number })?.statusCode;
		if (statusCode === 404) {
			return error(404, 'HTML snapshot not found');
		}
		return error(500, 'Failed to fetch HTML snapshot from storage');
	}
};
