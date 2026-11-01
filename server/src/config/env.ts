import dotenv from 'dotenv';
import dns from 'node:dns';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../');
dotenv.config({ path: resolve(repositoryRoot, '.env') });

const configuredDnsServers = process.env['MONGODB_DNS_SERVERS']
	?.split(',')
	.map((server) => server.trim())
	.filter(Boolean);

if (configuredDnsServers?.length) {
	dns.setServers(configuredDnsServers);
}
