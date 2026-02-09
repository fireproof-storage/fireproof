# CNPM Test Setup

## Start
```bash
cd /Users/menabe/Software/fproof/fireproof/scripts/cnpm-test
docker-compose up -d
```

## Check logs
```bash
docker-compose logs -f cnpmjs
```

## Stop
```bash
docker-compose down
```

## Remove everything
```bash
docker-compose down -v
```

## Registry URLs
- Registry: http://localhost:7001
- Web UI: http://localhost:7002

## Test publish
```bash
npm publish --registry http://localhost:7001
```
