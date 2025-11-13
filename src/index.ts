import { DurableObject } from "cloudflare:workers";

/**
 * Welcome to Cloudflare Workers! This is your first Durable Objects application.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your Durable Object in action
 * - Run `npm run deploy` to publish your application
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/durable-objects
 */

/** A Durable Object's behavior is defined in an exported Javascript class */

interface ReminderTask {
taskId: string;
reminderAt: number;
content: string;
userId: string;
}

export class ReminderTimer extends DurableObject<Env> {

	protected ctx: DurableObjectState;
	protected env: Env;
	/**
	 * The constructor is invoked once upon creation of the Durable Object, i.e. the first call to
	 * 	`DurableObjectStub::get` for a given identifier (no-op constructors can be omitted)
	 *
	 * @param ctx - The interface for interacting with Durable Object state
	 * @param env - The interface to reference bindings declared in wrangler.jsonc
	 */
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.ctx = ctx;
		this.env = env;
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const method = request.method;

		if (method === "POST" && url.pathname === "/create") {
			const {reminderAt, content, userId} = await request.json() as ReminderTask;
			const taskId = crypto.randomUUID();
			const taskItem = {taskId, reminderAt, content, userId};
			const taskPool = ( await this.ctx.storage.get<Record<string, ReminderTask>>("tasks"))|| {};
			taskPool[taskId] = taskItem;
			await this.ctx.storage.put("tasks", taskPool);

			this._setNextAlarm(taskPool);
			
			return new Response(JSON.stringify({status: "success", taskId}), {status: 200});

		}
		else if (method === "DELETE" && url.pathname.startsWith("/delete")) {
			const taskId = url.pathname.split("/").pop() || "";
			const taskPool = (await this.ctx.storage.get<Record<string, ReminderTask>>("tasks")) || {};
			delete taskPool[taskId];
			await this.ctx.storage.put("tasks", taskPool);
			await this._setNextAlarm(taskPool);
			
			return new Response(JSON.stringify({status: "delete success", taskId}), {status: 200});
		}
		else if (method === "GET" && url.pathname.startsWith("/list")) {
			const taskPool = (await this.ctx.storage.get<Record<string, ReminderTask>>("tasks")) || {};
			return new Response(JSON.stringify({tasks: Object.values(taskPool)}), {
				status: 200, 
				headers:{"Content-type":"application/json"
				}});

		}

		return new Response("Durable Object is alive!");
	}

	async alarm(alarmInfo?: AlarmInvocationInfo): Promise<void> {
		// This method is invoked when an alarm set by this Durable Object fires.
		const now = Date.now();
		const tasks:Record<string, ReminderTask> = (await this.ctx.storage.get<Record<string, ReminderTask>>("tasks")) || {};
		const remainingTasks: Record<string, ReminderTask> = {};
		let netxTime = Infinity;

		for (const [taskId, task] of Object.entries(tasks)) {
			if (task.reminderAt <= now) {
				// Trigger reminder
				//TODO
				
			}
			else {
				remainingTasks[taskId] = task;
				if (task.reminderAt < netxTime) {
					netxTime = task.reminderAt;
				}
				if(netxTime != Infinity){
					await this.ctx.storage.setAlarm(netxTime);
				}
			}
		}

		await this.ctx.storage.put("tasks", remainingTasks);
		if (netxTime != Infinity) {
			await this.ctx.storage.setAlarm(netxTime);
		}
	}

	private async _setNextAlarm(tasks : Record<string, ReminderTask>): Promise<void> {
		let netxTime = Infinity;
		for (const task of Object.values(tasks)) {
			if (task.reminderAt < netxTime) {
				netxTime = task.reminderAt;
			}
		}
	}
}

export default {
	/**
	 * This is the standard fetch handler for a Cloudflare Worker
	 *
	 * @param request - The request submitted to the Worker from the client
	 * @param env - The interface to reference bindings declared in wrangler.jsonc
	 * @param ctx - The execution context of the Worker
	 * @returns The response to be sent back to the client
	 */
	async fetch(request, env, ctx): Promise<Response> {
		// Create a `DurableObjectId` for an instance of the `MyDurableObject`
		// class. The name of class is used to identify the Durable Object.
		// Requests from all Workers to the instance named
		// will go to a single globally unique Durable Object instance.
		const id: DurableObjectId = env.REMINDER_TIMER.idFromName(
			new URL(request.url).pathname,
		);

		// Create a stub to open a communication channel with the Durable
		// Object instance.
		const stub = env.REMINDER_TIMER.get(id);

		// Call the `sayHello()` RPC method on the stub to invoke the method on
		// the remote Durable Object instance
		const greeting = await stub.fetch(request);

		return greeting;
	},
} satisfies ExportedHandler<Env>;
