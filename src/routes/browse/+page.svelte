<script>
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import ListFilter from 'lucide-svelte/icons/list-filter';

	import EllipsisVertical from 'lucide-svelte/icons/ellipsis-vertical';
	import { Separator } from '$lib/components/ui/separator/index.js';

	import Player from '$lib/components/Player.svelte';
</script>

<main class="grid flex-1 items-start gap-4 p-4 sm:px-6 md:gap-8 lg:grid-cols-3 xl:grid-cols-3">
	<div class="grid auto-rows-max items-start gap-4 md:gap-8 lg:col-span-2">
		<div class="grid gap-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
			<Card.Root
				class="sm:col-span-2"
				data-x-chunk-name="dashboard-05-chunk-0"
				data-x-chunk-description="A card for a playlist dashboard with a description and a button to improt a new playlist."
			>
				<Card.Header class="pb-3">
					<Card.Title>Your Playlist</Card.Title>
					<Card.Description class="max-w-lg text-balance leading-relaxed">
						Use your own custom youtube API_KEY to import your playlist or load an existing
						collection of videos.
					</Card.Description>
				</Card.Header>
				<Card.Footer>
					<Button>Import New Playlist</Button>
				</Card.Footer>
			</Card.Root>
			<Card.Root
				data-x-chunk-name="dashboard-05-chunk-1"
				data-x-chunk-description="A stats card showing the number of imported videos and a progress bar indicating how many videos have been ranked."
			>
				<Card.Header class="pb-2">
					<Card.Description>This Playlist</Card.Description>
					<Card.Title class="text-4xl">915</Card.Title>
				</Card.Header>
				<Card.Content>
					<div class="text-xs text-muted-foreground">total videos</div>
				</Card.Content>
				<Card.Footer>
					<Progress value={25} aria-label="25% ranked" />
				</Card.Footer>
			</Card.Root>
			<Card.Root
				data-x-chunk-name="dashboard-05-chunk-1"
				data-x-chunk-description="A stats card showing the number of imported videos and a progress bar indicating how many videos have been ranked."
			>
				<Card.Header class="pb-2">
					<Card.Description>Top Videos</Card.Description>
					<Card.Title class="text-4xl">405</Card.Title>
				</Card.Header>
				<Card.Content>
					<div class="text-xs text-muted-foreground">S-tier videos</div>
				</Card.Content>
				<Card.Footer>
					<Progress value={13} aria-label="13% s-tier videos" />
				</Card.Footer>
			</Card.Root>
		</div>

		<Player />

		<div class="flex items-center">
			<ToggleGroup.Root variant="outline" type="multiple">
				<ToggleGroup.Item value="S" aria-label="Toggle S tier">
					<h2>S</h2>
				</ToggleGroup.Item>
				<ToggleGroup.Item value="A" aria-label="Toggle A tier">
					<h2>A</h2>
				</ToggleGroup.Item>
				<ToggleGroup.Item value="B" aria-label="Toggle B tier">
					<h2>B</h2>
				</ToggleGroup.Item>
				<ToggleGroup.Item value="C" aria-label="Toggle C tier">
					<h2>C</h2>
				</ToggleGroup.Item>
				<ToggleGroup.Item value="D" aria-label="Toggle D tier">
					<h2>D</h2>
				</ToggleGroup.Item>
				<ToggleGroup.Item value="F" aria-label="Toggle F tier">
					<h2>F</h2>
				</ToggleGroup.Item>
			</ToggleGroup.Root>

			<div class="ml-auto flex items-center gap-2">
				<DropdownMenu.Root>
					<DropdownMenu.Trigger asChild let:builder>
						<Button variant="outline" size="sm" class="h-7 gap-1 text-sm" builders={[builder]}>
							<ListFilter class="h-3.5 w-3.5" />
							<span class="sr-only sm:not-sr-only">Filter</span>
						</Button>
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end">
						<DropdownMenu.Label>Filter by</DropdownMenu.Label>
						<DropdownMenu.Separator />
						<DropdownMenu.CheckboxItem checked>Hide unavailable</DropdownMenu.CheckboxItem>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>
		</div>
	</div>

	<div>
		<Card.Root
			class="overflow-hidden"
			data-x-chunk-name="dashboard-05-chunk-4"
			data-x-chunk-description="An order details card with order details, shipping information, customer information and payment information."
		>
			<Card.Header class="flex flex-row items-start bg-muted/50">
				<div class="grid gap-0.5">
					<Card.Title class="group flex items-center gap-2 text-lg">Playlist Name</Card.Title>
					<Card.Description>Created: November 23, 2023</Card.Description>
				</div>
				<div class="ml-auto flex items-center gap-1">
					<Button size="sm" variant="outline" class="h-8 gap-1">
						<!-- <Truck class="h-3.5 w-3.5" /> -->
						<span class="lg:sr-only xl:not-sr-only xl:whitespace-nowrap"> Open in YouTube </span>
					</Button>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger asChild let:builder>
							<Button builders={[builder]} size="icon" variant="outline" class="h-8 w-8">
								<EllipsisVertical class="h-3.5 w-3.5" />
								<span class="sr-only">More</span>
							</Button>
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							<DropdownMenu.Item>Export</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</div>
			</Card.Header>
			<Card.Content class="p-6 text-sm">
				<div class="grid gap-3">
					<div class="font-semibold">Order Details</div>
					<ul class="grid gap-3">
						<li class="flex items-center justify-between">
							<span class="text-muted-foreground">
								Glimmer Lamps x <span>2</span>
							</span>
							<span>$250.00</span>
						</li>
						<li class="flex items-center justify-between">
							<span class="text-muted-foreground">
								Aqua Filters x <span>1</span>
							</span>
							<span>$49.00</span>
						</li>
					</ul>
					<Separator class="my-2" />
					<ul class="grid gap-3">
						<li class="flex items-center justify-between">
							<span class="text-muted-foreground">Subtotal</span>
							<span>$299.00</span>
						</li>
						<li class="flex items-center justify-between">
							<span class="text-muted-foreground">Shipping</span>
							<span>$5.00</span>
						</li>
						<li class="flex items-center justify-between">
							<span class="text-muted-foreground">Tax</span>
							<span>$25.00</span>
						</li>
						<li class="flex items-center justify-between font-semibold">
							<span class="text-muted-foreground">Total</span>
							<span>$329.00</span>
						</li>
					</ul>
				</div>
				<Separator class="my-4" />
				<div class="grid grid-cols-2 gap-4">
					<div class="grid gap-3">
						<div class="font-semibold">Shipping Information</div>
						<address class="grid gap-0.5 not-italic text-muted-foreground">
							<span>Liam Johnson</span>
							<span>1234 Main St.</span>
							<span>Anytown, CA 12345</span>
						</address>
					</div>
					<div class="grid auto-rows-max gap-3">
						<div class="font-semibold">Billing Information</div>
						<div class="text-muted-foreground">Same as shipping address</div>
					</div>
				</div>
				<Separator class="my-4" />
				<div class="grid gap-3">
					<div class="font-semibold">Customer Information</div>
					<dl class="grid gap-3">
						<div class="flex items-center justify-between">
							<dt class="text-muted-foreground">Customer</dt>
							<dd>Liam Johnson</dd>
						</div>
						<div class="flex items-center justify-between">
							<dt class="text-muted-foreground">Email</dt>
							<dd>
								<a href="mailto:">liam@acme.com</a>
							</dd>
						</div>
						<div class="flex items-center justify-between">
							<dt class="text-muted-foreground">Phone</dt>
							<dd>
								<a href="tel:">+1 234 567 890</a>
							</dd>
						</div>
					</dl>
				</div>
				<Separator class="my-4" />
				<div class="grid gap-3">
					<div class="font-semibold">Payment Information</div>
					<dl class="grid gap-3">
						<div class="flex items-center justify-between">
							<dt class="flex items-center gap-1 text-muted-foreground">
								<!-- <CreditCard class="h-4 w-4" /> -->
								Visa
							</dt>
							<dd>**** **** **** 4532</dd>
						</div>
					</dl>
				</div>
			</Card.Content>

			<Card.Footer class="flex flex-row items-center border-t bg-muted/50 px-6 py-3">
				<div class="text-xs text-muted-foreground">
					Updated <time dateTime="2023-11-23">November 23, 2023</time>
				</div>
				<!-- <Pagination.Root count={10} class="ml-auto mr-0 w-auto">
              <Pagination.Content>
                <Pagination.Item>
                  <Button size="icon" variant="outline" class="h-6 w-6">
                    <ChevronLeft class="h-3.5 w-3.5" />
                    <span class="sr-only">Previous Order</span>
                  </Button>
                </Pagination.Item>
                <Pagination.Item>
                  <Button size="icon" variant="outline" class="h-6 w-6">
                    <ChevronRight class="h-3.5 w-3.5" />
                    <span class="sr-only">Next Order</span>
                  </Button>
                </Pagination.Item>
              </Pagination.Content>
            </Pagination.Root> -->
			</Card.Footer>
		</Card.Root>
	</div>
</main>
