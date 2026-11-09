# asyncio.run() runs the program's coroutines (#86), in CPython's order.
import asyncio


async def worker(name, delay):
    await asyncio.sleep(delay)
    print(name, "done after", delay)
    return name


async def main():
    task = asyncio.create_task(worker("a", 2))
    results = await asyncio.gather(worker("b", 1), worker("c", 3))
    print(results, await task)
    queue = asyncio.Queue()
    await queue.put("item")
    print(await queue.get())
    try:
        await asyncio.wait_for(asyncio.sleep(10), timeout=1)
    except TimeoutError:
        print("timed out")
    return "finished"


print(asyncio.run(main()))
