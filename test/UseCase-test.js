// LICENSE : MIT
"use strict";
const assert = require("power-assert");
const sinon = require("sinon");
import { UseCase } from "../lib/UseCase";
import { Dispatcher } from "../lib/Dispatcher";
import { Store } from "../lib/Store";
import { Context } from "../lib/Context";
import { TYPE as CompletedPayloadType } from '../lib/payload/CompletedPayload';
import { TYPE as DidExecutedPayloadType } from '../lib/payload/DidExecutedPayload';
import { TYPE as WillExecutedPayloadType } from '../lib/payload/WillExecutedPayload';
import { UseCaseContext } from "../lib/UseCaseContext";

describe("UseCase", function() {
    describe("id", () => {
        it("should have unique id in instance", () => {
            const aUseCase = new UseCase();
            assert(typeof aUseCase.id === "string");
            const bUseCase = new UseCase();
            assert(typeof bUseCase.id === "string");
            assert(aUseCase.id !== bUseCase.id);
        });
    });
    describe("name", () => {
        // IE9, 10 not have Function.name
        xit("should have name that same with UseCase.name by default", () => {
            class ExampleUseCase extends UseCase {
                execute() {

                }
            }
            const useCase = new ExampleUseCase();
            assert(useCase.name === "ExampleUseCase");
        });
        context("when define displayName", () => {
            it("#name is same with displayName", () => {
                class MyUseCase extends UseCase {
                }
                const expectedName = "Expected UseCase";
                MyUseCase.displayName = expectedName;
                const store = new MyUseCase();
                assert.equal(store.name, expectedName);
            });
        });
    });
    describe("#throwError", function() {
        it("should dispatch thought onDispatch event", function(done) {
            class TestUseCase extends UseCase {
                execute() {
                    this.throwError(new Error("error"));
                }
            }
            const testUseCase = new TestUseCase();
            // then
            testUseCase.onDispatch(({type, error}) => {
                assert(error instanceof Error);
                done();
            });
            // when
            testUseCase.execute();
        });
    });
    // scenario
    context("when execute B UseCase in A UseCase", function() {
        it("should execute A:will -> B:will -> B:did -> A:did", function() {
            class BUseCase extends UseCase {
                execute() {
                    return "b"
                }
            }
            class AUseCase extends UseCase {
                execute() {
                    const bUseCase = new BUseCase();
                    const useCaseContext = this.context;
                    useCaseContext.useCase(bUseCase).execute();
                }
            }
            const aUseCase = new AUseCase();
            // for reference fn.name
            const bUseCase = new BUseCase();
            const callStack = [];
            const expectedCallStackOfAUseCase = [
                WillExecutedPayloadType,
                DidExecutedPayloadType,
                CompletedPayloadType
            ];
            const expectedCallStack = [
                `${aUseCase.name}:will`,
                `${bUseCase.name}:will`,
                `${bUseCase.name}:did`,
                `${aUseCase.name}:did`
            ];
            const dispatcher = new Dispatcher();
            const context = new Context({
                dispatcher,
                store: new Store()
            });
            // then
            aUseCase.onDispatch(payload => {
                const type = payload.type;
                const expectedType = expectedCallStackOfAUseCase.shift();
                assert.equal(type, expectedType);
            });
            context.onWillExecuteEachUseCase((payload, meta) => {
                callStack.push(`${meta.useCase.name}:will`);
            });
            context.onDidExecuteEachUseCase((payload, meta) => {
                callStack.push(`${meta.useCase.name}:did`);
            });
            // when
            return context.useCase(aUseCase).execute().then(() => {
                assert.deepEqual(callStack, expectedCallStack);
            });
        });
        it("UseCase should have `context` that is Context instance", function() {
            class TestUseCase extends UseCase {
                execute() {
                    // then
                    assert(this.context instanceof UseCaseContext);
                    assert(typeof this.dispatch === "function");
                }
            }
            const dispatcher = new Dispatcher();
            const context = new Context({
                dispatcher,
                store: new Store()
            });
            const useCase = new TestUseCase();
            // when
            context.useCase(useCase).execute();
        });
    });
    context("when not implemented execute()", function() {
        it("should assert error on constructor", function() {
            class TestUseCase extends UseCase {
            }
            try {
                const useCase = new TestUseCase();
                useCase.execute();
                throw new Error("unreachable");
            } catch (error) {
                assert(error.name === "TypeError");
            }
        });
    });
    context("UseCase is nesting", function() {
        /*
            P: Parent UseCase
            C: Child UseCase

                           C fin.       P fin.
            |---------------|------------|
            P    |          |
                 C----------

         */
        context("when child did completed before parent is completed", function() {
            const childPayload = {
                type: "ChildUseCase"
            };
            class ChildUseCase extends UseCase {
                execute() {
                    this.dispatch(childPayload);
                }
            }
            class ParentUseCase extends UseCase {
                execute() {
                    return this.context.useCase(new ChildUseCase()).execute();
                }
            }
            it("should delegate dispatch to parent -> dispatcher", function() {
                const dispatcher = new Dispatcher();
                const context = new Context({
                    dispatcher,
                    store: new Store()
                });
                const dispatchedPayloads = [];
                dispatcher.onDispatch(payload => {
                    dispatchedPayloads.push(payload);
                });
                return context.useCase(new ParentUseCase()).execute().then(() => {
                    // childPayload should be delegated to dispatcher(root)
                    assert(dispatchedPayloads.indexOf(childPayload) !== -1);
                });
            });
        });
        /*
            P: Parent UseCase
            C: Child UseCase

                            P fin.   C fin.
            |---------------|          |
            P    |                     |
                 C---------------------|
                                  |
                              C call dispatch()

         */
        context("when child is completed after parent did completed", function() {
            let consoleWarnStub = null;
            beforeEach(() => {
                consoleWarnStub = sinon.stub(console, "warn");
            });
            afterEach(() => {
                consoleWarnStub.restore();
            });
            it("should not delegate dispatch to parent -> dispatcher and show warning", function(done) {
                const childPayload = {
                    type: "ChildUseCase"
                };
                const dispatchedPayloads = [];
                const finishCallBack = () => {
                    // childPayload should not be delegated to dispatcher(root)
                    assert(dispatchedPayloads.indexOf(childPayload) === -1);
                    // insteadof of it, should be display warning messages
                    assert(consoleWarnStub.called);
                    const warningMessage = consoleWarnStub.getCalls()[0].args[0];
                    assert(/UseCase.*?is already released/.test(warningMessage), warningMessage);
                    done();
                };
                class ChildUseCase extends UseCase {
                    execute() {
                        this.dispatch(childPayload);
                        finishCallBack();
                    }
                }
                class ParentUseCase extends UseCase {
                    execute() {
                        // ChildUseCase is independent from Parent
                        // But, ChildUseCase is executed from Parent
                        // This is programming error
                        setTimeout(() => {
                            this.context.useCase(new ChildUseCase()).execute();
                        }, 16);
                        return Promise.resolve();
                    }
                }

                const dispatcher = new Dispatcher();
                const context = new Context({
                    dispatcher,
                    store: new Store()
                });
                dispatcher.onDispatch(payload => {
                    dispatchedPayloads.push(payload);
                });
                context.useCase(new ParentUseCase()).execute();
            });
        });
    });
});
