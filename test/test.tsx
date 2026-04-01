import React from 'react';
import test from 'ava';
import {Text, useStdin, useStderr} from 'ink';
import delay from 'delay';
import {render} from '../source/index.js';

test('render a single frame', t => {
	function Test() {
		return <Text>Hello World</Text>;
	}

	const {frames, lastFrame} = render(<Test />);

	t.is(lastFrame(), 'Hello World');
	t.deepEqual(frames, ['Hello World']);
});

test('render multiple frames', t => {
	function Counter({count}: {readonly count: number}) {
		return <Text>Count: {count}</Text>;
	}

	const {frames, lastFrame, rerender} = render(<Counter count={0} />);

	t.is(lastFrame(), 'Count: 0');
	t.deepEqual(frames, ['Count: 0']);

	rerender(<Counter count={1} />);

	t.is(lastFrame(), 'Count: 1');
	t.deepEqual(frames, ['Count: 0', 'Count: 1']);
});

test('unmount class component', t => {
	let didMount = false;
	let didUnmount = false;

	class Test extends React.Component {
		override render() {
			return <Text>Hello World</Text>;
		}

		override componentDidMount() {
			didMount = true;
		}

		override componentWillUnmount() {
			didUnmount = true;
		}
	}

	const {lastFrame, unmount} = render(<Test />);

	t.is(lastFrame(), 'Hello World');
	t.true(didMount);
	t.false(didUnmount);

	unmount();

	t.true(didUnmount);
});

test('unmount function component', t => {
	let didMount = false;
	let didUnmount = false;

	function Test() {
		React.useLayoutEffect(() => {
			didMount = true;

			return () => {
				didUnmount = true;
			};
		}, []);

		return <Text>Hello World</Text>;
	}

	const {lastFrame, unmount} = render(<Test />);

	t.is(lastFrame(), 'Hello World');
	t.true(didMount);
	t.false(didUnmount);

	unmount();
	t.true(didUnmount);
});

test('write to stdin', async t => {
	function Test() {
		const [input, setInput] = React.useState('');
		const {stdin, setRawMode} = useStdin();

		React.useEffect(() => {
			const handleData = (data: string) => {
				setInput(data);
			};

			setRawMode(true);
			stdin.on('data', handleData);

			return () => {
				setRawMode(false);
				stdin.off('data', handleData);
			};
		}, [stdin, setRawMode]);

		return <Text>{input}</Text>;
	}

	const {stdin, lastFrame, waitFor} = render(<Test />);
	t.is(lastFrame(), '');
	// Let useEffect set up the stdin listener before writing.
	await delay(0);
	stdin.write('Hello World');
	await waitFor(() => {
		if (lastFrame() !== 'Hello World') {
			throw new Error(`Expected "Hello World", got "${lastFrame()}"`);
		}
	});
	t.is(lastFrame(), 'Hello World');
});

test('write to stderr', async t => {
	function Test() {
		const {write} = useStderr();

		React.useEffect(() => {
			write('Hello World');
		}, [write]);

		return <Text>Output</Text>;
	}

	const {stderr, lastFrame, waitFor} = render(<Test />);
	t.is(lastFrame(), 'Output');
	await waitFor(() => {
		if (stderr.lastFrame() !== 'Hello World') {
			throw new Error(`Expected "Hello World", got "${stderr.lastFrame()}"`);
		}
	});
	t.is(stderr.lastFrame(), 'Hello World');
});

test('waitFor resolves immediately if assertion already passes', async t => {
	function Test() {
		return <Text>Already here</Text>;
	}

	const {lastFrame, waitFor} = render(<Test />);
	await waitFor(() => {
		if (lastFrame() !== 'Already here') {
			throw new Error('not yet');
		}
	});
	t.is(lastFrame(), 'Already here');
});

test('waitFor waits for useEffect state update', async t => {
	function Test() {
		const [ready, setReady] = React.useState(false);
		React.useEffect(() => {
			setReady(true);
		}, []);
		return <Text>{ready ? 'ready' : 'init'}</Text>;
	}

	const {lastFrame, waitFor} = render(<Test />);
	await waitFor(() => {
		if (lastFrame() !== 'ready') {
			throw new Error(`Expected "ready", got "${lastFrame()}"`);
		}
	});
	t.is(lastFrame(), 'ready');
});

test('waitFor waits for cascading effects', async t => {
	function Test() {
		const [step, setStep] = React.useState(0);
		React.useEffect(() => {
			if (step < 3) {
				setStep(s => s + 1);
			}
		}, [step]);
		return <Text>step-{step}</Text>;
	}

	const {lastFrame, waitFor} = render(<Test />);
	await waitFor(() => {
		if (lastFrame() !== 'step-3') {
			throw new Error(`Expected "step-3", got "${lastFrame()}"`);
		}
	});
	t.is(lastFrame(), 'step-3');
});

test('waitFor waits for promise-based state update', async t => {
	function Test() {
		const [data, setData] = React.useState('loading');
		React.useEffect(() => {
			void Promise.resolve('fetched').then(setData);
		}, []);
		return <Text>{data}</Text>;
	}

	const {lastFrame, waitFor} = render(<Test />);
	await waitFor(() => {
		if (lastFrame() !== 'fetched') {
			throw new Error(`Expected "fetched", got "${lastFrame()}"`);
		}
	});
	t.is(lastFrame(), 'fetched');
});

test('waitFor rejects on timeout with last assertion error', async t => {
	function Test() {
		return <Text>static</Text>;
	}

	const {waitFor} = render(<Test />);
	const error = await t.throwsAsync(async () =>
		waitFor(
			() => {
				throw new Error('never passes');
			},
			{timeout: 100},
		),
	);
	t.is(error?.message, 'never passes');
});

test('waitFor rejects with generic message when no frames arrive', async t => {
	function Test() {
		return <Text>static</Text>;
	}

	const {waitFor} = render(<Test />);
	const error = await t.throwsAsync(async () =>
		waitFor(
			() => {
				throw new Error('not yet');
			},
			{timeout: 100},
		),
	);
	t.truthy(error);
});
