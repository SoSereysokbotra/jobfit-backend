import { Result } from './result';

export interface IUseCase<IRequest, IResponse> {
  execute(request?: IRequest): Promise<Result<IResponse, any>> | Result<IResponse, any>;
}
