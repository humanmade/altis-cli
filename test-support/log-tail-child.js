const extension = process.env.ALTIS_TEST_SOURCE ? 'ts' : 'js';
const directory = process.env.ALTIS_TEST_SOURCE ? '../lib' : '../dist/lib';
const { default: Vantage } = await import(`${directory}/vantage.${extension}`);
const { default: stream } = await import(`${directory}/stream.${extension}`);
const { default: command } = await import(`${directory}/commands/stack/${process.argv[2]}.${extension}`);
// Other libraries may handle SIGINT without terminating the process.
process.on('SIGINT', () => {});
if (process.argv[3] === 'pending') {
 Vantage.prototype.getLogStream = () => {
  console.log('WAITING');
  setInterval(() => {}, 1000);
  return new Promise(() => {});
 };
} else {
 Vantage.prototype.getLogStream = async () => {
  const source = stream(process.argv[3], { retry: 1000 });
  source.once('open', () => console.log('READY'));
  source.once('retry', () => console.log('RETRY'));
  source.once('close', () => console.log('CLOSED'));
  return source;
 };
}
await command.handler({ stack: 'example-dev', type: 'php', tail: true, config: { get: () => undefined } });
